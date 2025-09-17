# VS Code Extension: Real-Time Token Monitoring & Automatic Context Storage

## Extension Architecture

Based on analysis of VS Code's codebase, we can build an extension that replicates Cursor's token monitoring functionality.

### Core Components

#### 1. **API Response Interceptor**
```typescript
// extension/src/tokenMonitor.ts
class TokenMonitor {
  private currentTokens = 0;
  private statusBarItem: vscode.StatusBarItem;
  private languageStatusItem: vscode.LanguageStatusItem;
  
  constructor() {
    // Create status bar indicator
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right, 
      100
    );
    
    // Create language status indicator for chat context
    this.languageStatusItem = vscode.languages.createLanguageStatusItem(
      'claude-context.tokenStatus',
      { language: '*' }
    );
  }
  
  // Hook into language model API calls
  private interceptAPIResponse(response: APIResponse) {
    const usage = response.usage;
    this.currentTokens += usage.input_tokens + usage.output_tokens;
    
    this.updateStatusDisplay();
    this.checkThresholds();
  }
  
  private updateStatusDisplay() {
    const percentage = (this.currentTokens / 200000) * 100;
    const color = percentage > 70 ? 'warning' : percentage > 62.5 ? 'orange' : 'white';
    
    // Status bar update
    this.statusBarItem.text = `$(symbol-misc) ${this.currentTokens.toLocaleString()} tokens (${percentage.toFixed(1)}%)`;
    this.statusBarItem.tooltip = `Claude Context: ${this.currentTokens} / 200,000 tokens`;
    this.statusBarItem.color = color;
    
    // Language status update
    this.languageStatusItem.text = `${this.currentTokens.toLocaleString()} tokens`;
    this.languageStatusItem.detail = `${percentage.toFixed(1)}% of context window used`;
    this.languageStatusItem.severity = percentage > 70 ? 
      vscode.LanguageStatusSeverity.Warning : 
      vscode.LanguageStatusSeverity.Information;
  }
  
  private async checkThresholds() {
    if (this.currentTokens >= 125000) { // 62.5% threshold
      await this.triggerContextStorage('CRITICAL');
    } else if (this.currentTokens >= 140000) { // 70% threshold
      await this.triggerContextStorage('WARNING');
    }
  }
  
  private async triggerContextStorage(level: 'CRITICAL' | 'WARNING') {
    const selection = await vscode.window.showWarningMessage(
      `Token usage at ${level} level (${this.currentTokens} tokens). Store conversation context?`,
      'Store Now',
      'Remind Later',
      'Settings'
    );
    
    if (selection === 'Store Now') {
      await this.storeCurrentContext();
      this.resetTokenCounter();
    }
  }
}
```

#### 2. **MCP Integration for Background Storage**
```typescript
// extension/src/mcpIntegration.ts
class MCPContextManager {
  private mcpClient: MCPClient;
  
  async storeConversation(conversationData: ConversationData) {
    // Store using our existing claude-context-fork MCP tools
    await this.mcpClient.callTool('mcp_claude-contex2_store_conversation', {
      conversationData: this.formatConversationForStorage(conversationData)
    });
  }
  
  private formatConversationForStorage(data: ConversationData): string {
    return `# Token Threshold Storage: ${new Date().toISOString()}

## ROLLING CONTEXT
- **Token Usage**: ${data.tokenCount} / 200,000 (${(data.tokenCount/200000*100).toFixed(1)}%)
- **Session Duration**: ${data.sessionDuration}
- **Files Active**: ${data.activeFiles.join(', ')}
- **Git Status**: ${data.gitStatus}

## THINKING (Research Process)
${data.searchResults.map(search => `
### Search: ${search.tool}
- **Query**: "${search.query}"
- **Source**: ${search.source}
- **Results**: ${search.results}
- **Impact**: ${search.impact}
`).join('\n')}

## VERBATIM MESSAGES
${data.messages.map(msg => `
[${msg.timestamp}] ${msg.type.toUpperCase()}: ${msg.content}
`).join('\n')}

## TECHNICAL IMPLEMENTATION
${data.filesModified.map(file => `
- **${file.path}**: ${file.purpose}
`).join('\n')}
`;
  }
}
```

#### 3. **VS Code Chat Integration Hook**
```typescript
// extension/src/chatIntegration.ts
class ChatIntegrationHook {
  private tokenMonitor: TokenMonitor;
  
  constructor(monitor: TokenMonitor) {
    this.tokenMonitor = monitor;
    this.setupChatHooks();
  }
  
  private setupChatHooks() {
    // Hook into VS Code's chat participant API
    const chatParticipant = vscode.chat.createChatParticipant('claude-context.monitor', this.handleChatRequest.bind(this));
    
    // Monitor chat responses
    chatParticipant.onDidReceiveFeedback(this.onChatFeedback.bind(this));
  }
  
  private async handleChatRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ) {
    // Extract token usage from request/response
    const tokenEstimate = this.estimateTokenUsage(request, context);
    this.tokenMonitor.addTokens(tokenEstimate);
    
    // Capture the actual chat exchange
    const chatData = {
      userPrompt: request.prompt,
      timestamp: new Date(),
      context: this.extractContextInfo(context)
    };
    
    await this.storeChatExchange(chatData);
  }
  
  private estimateTokenUsage(request: vscode.ChatRequest, context: vscode.ChatContext): number {
    // Estimate based on request content + context
    const promptTokens = Math.ceil(request.prompt.length / 4);
    const contextTokens = Math.ceil(JSON.stringify(context).length / 4);
    return promptTokens + contextTokens;
  }
}
```

### 4. **Extension Entry Point**
```typescript
// extension/src/extension.ts
export function activate(context: vscode.ExtensionContext) {
  const tokenMonitor = new TokenMonitor();
  const mcpManager = new MCPContextManager();
  const chatHook = new ChatIntegrationHook(tokenMonitor);
  
  // Register commands
  const storeContextCommand = vscode.commands.registerCommand(
    'claude-context.storeContext',
    () => tokenMonitor.storeCurrentContext()
  );
  
  const resetCounterCommand = vscode.commands.registerCommand(
    'claude-context.resetCounter',
    () => tokenMonitor.resetTokenCounter()
  );
  
  const showStatsCommand = vscode.commands.registerCommand(
    'claude-context.showStats',
    () => tokenMonitor.showDetailedStats()
  );
  
  // Register for cleanup
  context.subscriptions.push(
    tokenMonitor,
    mcpManager,
    chatHook,
    storeContextCommand,
    resetCounterCommand,
    showStatsCommand
  );
  
  // Auto-start monitoring
  tokenMonitor.startMonitoring();
}
```

### 5. **Extension Manifest**
```json
{
  "name": "claude-context-monitor",
  "displayName": "Claude Context Monitor",
  "description": "Real-time token monitoring with automatic context storage",
  "version": "1.0.0",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other"],
  "contributes": {
    "commands": [
      {
        "command": "claude-context.storeContext",
        "title": "Store Current Context",
        "category": "Claude Context"
      },
      {
        "command": "claude-context.resetCounter",
        "title": "Reset Token Counter",
        "category": "Claude Context"
      },
      {
        "command": "claude-context.showStats",
        "title": "Show Token Statistics",
        "category": "Claude Context"
      }
    ],
    "configuration": {
      "title": "Claude Context Monitor",
      "properties": {
        "claude-context.criticalThreshold": {
          "type": "number",
          "default": 125000,
          "description": "Token count for critical threshold (62.5%)"
        },
        "claude-context.warningThreshold": {
          "type": "number", 
          "default": 140000,
          "description": "Token count for warning threshold (70%)"
        },
        "claude-context.autoStore": {
          "type": "boolean",
          "default": true,
          "description": "Automatically trigger storage at thresholds"
        }
      }
    }
  },
  "activationEvents": [
    "onStartupFinished"
  ]
}
```

## Implementation Benefits

### **Real-Time Tracking**
- **Exact token counts** from API responses (like Cursor shows)
- **Visual indicators** in status bar and language status
- **Threshold warnings** with automatic storage triggers

### **Seamless Integration**
- **Background operation** doesn't interrupt workflow
- **MCP integration** with our existing context tools
- **VS Code native** status indicators and notifications

### **Proactive Memory Management**
- **125k/140k thresholds** prevent summarization
- **Automatic context storage** before limits
- **Reset capability** for fresh context starts

This extension would provide the same functionality as Cursor's token monitoring while integrating perfectly with our claude-context-fork memory system. The key is hooking into VS Code's language model APIs to capture real token usage data, just like your API logs showed.

Would you like me to start implementing this extension?