# VS Code Chat Bridge Architecture

## Core Concept
The chat bridge sits between VS Code's chat interface and the underlying AI model, intercepting conversations before they reach VS Code's summarization system.

## How It Works
```python
class VSCodeChatBridge:
    def __init__(self, token_threshold=100_000):
        self.token_threshold = token_threshold
        self.current_tokens = 0
        
    def intercept_chat_message(self, message):
        # Count tokens in current conversation
        self.current_tokens += self.estimate_tokens(message)
        
        # At 100k tokens (50% of 200k limit)
        if self.current_tokens >= self.token_threshold:
            # 1. Store full conversation in external memory
            self.store_conversation_state()
            
            # 2. Purge local context (critical step)
            self.purge_vscode_context()
            
            # 3. Reset token counter
            self.current_tokens = 0
            
            # 4. Continue with fresh context
            return self.continue_with_fresh_context(message)
```

## The Critical Purge Step

### Why Purging Is Essential
- **Prevent VS Code takeover**: If we don't purge, VS Code will still hit its 200k limit and summarize
- **Maintain control**: We want OUR system managing context, not VS Code's summarization
- **Preserve continuity**: User sees seamless conversation despite context management

### Purging Strategies
```python
def purge_vscode_context(self):
    # Option 1: Clear chat history programmatically
    vscode.window.activeTextEditor.clear_chat_history()
    
    # Option 2: Restart chat session
    self.start_new_chat_session()
    
    # Option 3: Context injection with minimal history
    self.inject_minimal_context_summary()
```

## 100k Token Management Flow

### 1. **Monitor Phase** (0-99k tokens)
- Track conversation token count in real-time
- Allow normal VS Code chat operation
- No intervention needed

### 2. **Capture Phase** (100k tokens reached)
- **Store complete conversation** in external memory with full fidelity
- **Capture workspace state** (open files, git status, cursor position)
- **Generate context summary** for continuity

### 3. **Purge Phase** (immediate after capture)
- **Clear VS Code chat history** to reset token counter
- **Prevent summarization** by staying well below 200k limit
- **Maintain user session** without interruption

### 4. **Restoration Phase** (new context)
- **Inject minimal context** to maintain conversation flow
- **Provide access** to full history via MCP search tools
- **Seamless continuation** from user perspective

## Implementation Benefits

### For Users
- **No memory loss**: Full conversation always preserved
- **No interruption**: Seamless experience despite context management
- **Better performance**: Never hit VS Code's 200k performance degradation
- **Smart retrieval**: Access to semantically relevant past context

### For AI Agents
- **Complete memory**: Access to full conversation history
- **Semantic search**: Find relevant past context via vector search
- **Cross-session continuity**: Remember across VS Code restarts
- **No summarization artifacts**: Pure, uncompressed conversation data

This approach gives us **proactive control** over context management instead of reactive summarization, solving the memory erasure problem you identified.