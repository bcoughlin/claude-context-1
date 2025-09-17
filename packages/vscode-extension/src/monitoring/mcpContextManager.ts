import * as vscode from 'vscode';
import { ConversationSnapshot, TokenUsageData, ChatMessage, SearchResult, FileModification } from './tokenMonitor';

export interface MCPConnectionConfig {
    serverUri?: string;
    transport?: 'stdio' | 'sse';
    enabled: boolean;
}

export interface ThreadInfo {
    threadId: string;
    threadTitle: string;
    firstMessage: string;
    created: Date;
    lastActivity: Date;
    sessionCount: number;
}

export interface SessionInfo {
    sessionId: string;
    threadId: string;
    sessionTitle: string;
    timestamp: Date;
    tokenCount: number;
    summary: string;
}

export class MCPContextManager {
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;
    private config: MCPConnectionConfig;
    private currentThreadId: string | null = null;
    private currentThreadTitle: string | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('Claude Context MCP');
        this.config = this.loadMCPConfig();
    }

    private async ensureThreadContext(threadTitle?: string): Promise<void> {
        if (!this.currentThreadId) {
            // Check if we can detect thread from VS Code context or user input
            const detectedTitle = threadTitle || await this.detectThreadTitle();
            await this.initializeThread(detectedTitle);
        }
    }

    private async detectThreadTitle(): Promise<string> {
        // Try to detect thread title from various sources
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const activeEditor = vscode.window.activeTextEditor;

        // Check if user wants to provide thread title
        const userTitle = await vscode.window.showInputBox({
            prompt: 'Enter conversation thread title (or press Enter for auto-detection)',
            placeHolder: 'e.g., "Checking if backend is running locally"'
        });

        if (userTitle) {
            return userTitle;
        }

        // Auto-detect based on workspace and context
        const baseName = workspaceFolder?.name || 'Unknown Project';
        const fileName = activeEditor ? vscode.workspace.asRelativePath(activeEditor.document.uri) : '';

        return fileName ? `${baseName}: ${fileName}` : `${baseName} Development`;
    }

    private async initializeThread(threadTitle: string): Promise<void> {
        this.currentThreadId = `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.currentThreadTitle = threadTitle;

        // Store thread info in workspace state
        await this.context.workspaceState.update('claude-context.currentThreadId', this.currentThreadId);
        await this.context.workspaceState.update('claude-context.currentThreadTitle', this.currentThreadTitle);

        this.outputChannel.appendLine(`Initialized thread: ${this.currentThreadId} - "${threadTitle}"`);
    }

    private loadMCPConfig(): MCPConnectionConfig {
        const config = vscode.workspace.getConfiguration('claude-context');
        return {
            serverUri: config.get('mcp.serverUri'),
            transport: config.get('mcp.transport', 'stdio'),
            enabled: config.get('mcp.enabled', true)
        };
    }

    public async storeConversation(snapshot: ConversationSnapshot, threadTitle?: string): Promise<boolean> {
        if (!this.config.enabled) {
            this.outputChannel.appendLine('MCP integration disabled, skipping storage');
            return false;
        }

        try {
            // Ensure we have a thread context
            await this.ensureThreadContext(threadTitle);

            const formattedData = this.formatConversationForStorage(snapshot);

            // Use the existing MCP command infrastructure
            // This will integrate with your existing MCP tools
            const success = await this.callMCPStorageCommand(formattedData);

            if (success) {
                this.outputChannel.appendLine(`Successfully stored conversation snapshot: ${snapshot.tokenCount} tokens`);

                // Show user notification
                vscode.window.showInformationMessage(
                    `Context stored via MCP: ${snapshot.tokenCount.toLocaleString()} tokens saved`,
                    'View Storage'
                ).then(selection => {
                    if (selection === 'View Storage') {
                        this.showStorageDetails();
                    }
                });

                return true;
            } else {
                throw new Error('MCP storage command failed');
            }

        } catch (error) {
            this.outputChannel.appendLine(`Failed to store conversation: ${error}`);

            // Fallback to local storage
            await this.fallbackToLocalStorage(snapshot);

            vscode.window.showWarningMessage(
                'MCP storage failed, saved locally instead. Check MCP connection.',
                'Open Output'
            ).then(selection => {
                if (selection === 'Open Output') {
                    this.outputChannel.show();
                }
            });

            return false;
        }
    }

    private formatConversationForStorage(snapshot: ConversationSnapshot): string {
        const timestamp = new Date().toISOString();
        const percentage = (snapshot.tokenCount / 200000 * 100).toFixed(2);

        return `# Token Threshold Storage: ${timestamp}

## CONTEXT SUMMARY
- **Storage Trigger**: Token threshold reached
- **Token Usage**: ${snapshot.tokenCount.toLocaleString()} / 200,000 (${percentage}%)
- **Session Duration**: ${snapshot.sessionDuration}
- **Workspace**: ${snapshot.workspaceContext?.workspaceName || 'Unknown'}
- **Active Files**: ${snapshot.activeFiles.length} files
- **Git Status**: ${snapshot.gitStatus}

## ROLLING CONTEXT
### Workspace State
- **Path**: ${snapshot.workspaceContext?.workspacePath || 'N/A'}
- **Active Editor**: ${snapshot.workspaceContext?.activeEditor ? vscode.workspace.asRelativePath(snapshot.workspaceContext.activeEditor) : 'None'}
- **Open Editors**: ${snapshot.workspaceContext?.openEditors || 0}

### Active Files
${snapshot.activeFiles.map(file => `- ${file}`).join('\n') || '- No active files'}

## THINKING (Research & Search Process)
${this.formatSearchHistory(snapshot.searchResults)}

## VERBATIM MESSAGES
${this.formatChatHistory(snapshot.messages)}

## TECHNICAL IMPLEMENTATION
### Files Modified
${this.formatFileModifications(snapshot.filesModified)}

### Session Analytics
- **Total Messages**: ${snapshot.messages.length}
- **Search Operations**: ${snapshot.searchResults.length}
- **File Modifications**: ${snapshot.filesModified.length}
- **Average Tokens per Message**: ${snapshot.messages.length > 0 ? Math.round(snapshot.tokenCount / snapshot.messages.length) : 0}

---
*Auto-stored by Claude Context Monitor extension at ${percentage}% token usage*
`;
    }

    private formatSearchHistory(searches: SearchResult[]): string {
        if (searches.length === 0) {
            return '- No search operations recorded';
        }

        return searches.map(search => `
### Search Operation: ${search.tool}
- **Query**: "${search.query}"
- **Source**: ${search.source}
- **Timestamp**: ${search.timestamp.toLocaleString()}
- **Results Summary**: ${search.results}
- **Impact**: ${search.impact}
`).join('\n');
    }

    private formatChatHistory(messages: ChatMessage[]): string {
        if (messages.length === 0) {
            return '- No chat messages recorded';
        }

        // Format recent messages (last 10 to avoid overwhelming storage)
        const recentMessages = messages.slice(-10);

        return recentMessages.map(msg => {
            const tokenInfo = msg.tokenUsage ?
                ` [${msg.tokenUsage.total_tokens} tokens: ${msg.tokenUsage.input_tokens}+${msg.tokenUsage.output_tokens}]` :
                '';

            return `
[${msg.timestamp.toLocaleString()}] **${msg.type.toUpperCase()}**${tokenInfo}:
${this.truncateContent(msg.content, 500)}
`;
        }).join('\n---\n');
    }

    private formatFileModifications(modifications: FileModification[]): string {
        if (modifications.length === 0) {
            return '- No file modifications recorded';
        }

        return modifications.map(mod =>
            `- **${mod.path}**: ${mod.purpose} (${mod.timestamp.toLocaleString()})`
        ).join('\n');
    }

    private truncateContent(content: string, maxLength: number): string {
        if (content.length <= maxLength) {
            return content;
        }

        return content.substring(0, maxLength) + '...\n*[Content truncated for storage]*';
    }

    private async callMCPStorageCommand(conversationData: string): Promise<boolean> {
        try {
            // Execute the MCP storage command using VS Code's command API
            // This integrates with your existing MCP infrastructure
            await vscode.commands.executeCommand(
                'mcp.call',
                'mcp_claude-contex2_store_conversation',
                {
                    conversationData,
                    project: await this.getCurrentProjectName(),
                    threadId: this.currentThreadId,
                    threadTitle: this.currentThreadTitle
                }
            ); return true;
        } catch (error) {
            this.outputChannel.appendLine(`MCP command execution failed: ${error}`);
            return false;
        }
    }

    private async getCurrentProjectName(): Promise<string | undefined> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        return workspaceFolder?.name;
    }

    private async fallbackToLocalStorage(snapshot: ConversationSnapshot): Promise<void> {
        try {
            // Store in workspace state as fallback
            const storageKey = `claude-context.backup.${Date.now()}`;
            const backupData = {
                timestamp: new Date().toISOString(),
                tokenCount: snapshot.tokenCount,
                sessionDuration: snapshot.sessionDuration,
                messageCount: snapshot.messages.length,
                searchCount: snapshot.searchResults.length
            };

            await this.context.workspaceState.update(storageKey, backupData);

            this.outputChannel.appendLine(`Fallback storage completed: ${storageKey}`);

        } catch (error) {
            this.outputChannel.appendLine(`Fallback storage also failed: ${error}`);
        }
    }

    public async retrieveStoredConversations(limit: number = 5): Promise<any[]> {
        if (!this.config.enabled) {
            return [];
        }

        try {
            // Call MCP list sessions command
            const sessions = await vscode.commands.executeCommand(
                'mcp.call',
                'mcp_claude-contex2_list_sessions',
                {
                    limit,
                    project: await this.getCurrentProjectName()
                }
            );

            return sessions as any[] || [];

        } catch (error) {
            this.outputChannel.appendLine(`Failed to retrieve stored conversations: ${error}`);
            return [];
        }
    }

    public async searchConversationMemory(query: string): Promise<any[]> {
        if (!this.config.enabled) {
            return [];
        }

        try {
            // Call MCP search memory command
            const results = await vscode.commands.executeCommand(
                'mcp.call',
                'mcp_claude-contex2_search_memory',
                {
                    query,
                    project: await this.getCurrentProjectName(),
                    limit: 10
                }
            );

            return results as any[] || [];

        } catch (error) {
            this.outputChannel.appendLine(`Failed to search conversation memory: ${error}`);
            return [];
        }
    }

    public async bootstrapContext(query: string): Promise<string | null> {
        if (!this.config.enabled) {
            return null;
        }

        try {
            // Call MCP bootstrap context command
            const context = await vscode.commands.executeCommand(
                'mcp.call',
                'mcp_claude-contex2_bootstrap_context',
                {
                    query,
                    project: await this.getCurrentProjectName()
                }
            );

            return context as string || null;

        } catch (error) {
            this.outputChannel.appendLine(`Failed to bootstrap context: ${error}`);
            return null;
        }
    }

    private async showStorageDetails(): Promise<void> {
        try {
            const recentSessions = await this.retrieveStoredConversations(10);

            const details = `# Claude Context Storage Summary

## Recent Sessions
${recentSessions.map((session, index) => `
${index + 1}. **${session.title || 'Untitled Session'}**
   - Stored: ${session.timestamp ? new Date(session.timestamp).toLocaleString() : 'Unknown'}
   - Summary: ${session.summary || 'No summary available'}
`).join('\n')}

## MCP Configuration
- **Enabled**: ${this.config.enabled}
- **Transport**: ${this.config.transport}
- **Server URI**: ${this.config.serverUri || 'Default'}

*Use Command Palette > "Claude Context: Search Memory" to find specific conversations*
`;

            const document = await vscode.workspace.openTextDocument({
                content: details,
                language: 'markdown'
            });

            await vscode.window.showTextDocument(document);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show storage details: ${error}`);
        }
    }

    public async validateMCPConnection(): Promise<boolean> {
        if (!this.config.enabled) {
            return false;
        }

        try {
            // Test MCP connection by trying to list sessions
            await this.retrieveStoredConversations(1);
            return true;
        } catch (error) {
            this.outputChannel.appendLine(`MCP connection validation failed: ${error}`);
            return false;
        }
    }

    // Enhanced thread management methods
    public async searchThreads(query: string): Promise<ThreadInfo[]> {
        try {
            // Search for threads by title or content
            const results = await vscode.commands.executeCommand(
                'mcp.call',
                'mcp_claude-contex2_search_memory',
                {
                    query: `Thread: ${query}`,
                    project: await this.getCurrentProjectName(),
                    limit: 20
                }
            );

            // Parse results to extract thread information
            return this.parseThreadResults(results as any[]);
        } catch (error) {
            this.outputChannel.appendLine(`Thread search failed: ${error}`);
            return [];
        }
    }

    private parseThreadResults(results: any[]): ThreadInfo[] {
        const threads: Map<string, ThreadInfo> = new Map();

        results.forEach(result => {
            const content = result.content || '';
            const threadMatch = content.match(/## Thread ID: (thread_[^\n]+)/);
            const titleMatch = content.match(/# Thread: ([^\n]+)/);

            if (threadMatch && titleMatch) {
                const threadId = threadMatch[1];
                const threadTitle = titleMatch[1];

                if (!threads.has(threadId)) {
                    threads.set(threadId, {
                        threadId,
                        threadTitle,
                        firstMessage: content.substring(0, 100) + '...',
                        created: new Date(result.timestamp || Date.now()),
                        lastActivity: new Date(result.timestamp || Date.now()),
                        sessionCount: 1
                    });
                } else {
                    const existing = threads.get(threadId)!;
                    existing.sessionCount++;
                    const resultDate = new Date(result.timestamp || Date.now());
                    if (resultDate > existing.lastActivity) {
                        existing.lastActivity = resultDate;
                    }
                }
            }
        });

        return Array.from(threads.values()).sort((a, b) =>
            b.lastActivity.getTime() - a.lastActivity.getTime()
        );
    }

    public async getSessionsForThread(threadId: string): Promise<SessionInfo[]> {
        try {
            const results = await vscode.commands.executeCommand(
                'mcp.call',
                'mcp_claude-contex2_search_memory',
                {
                    query: `Thread ID: ${threadId}`,
                    project: await this.getCurrentProjectName(),
                    limit: 50
                }
            );

            return this.parseSessionResults(results as any[], threadId);
        } catch (error) {
            this.outputChannel.appendLine(`Session retrieval failed: ${error}`);
            return [];
        }
    }

    private parseSessionResults(results: any[], threadId: string): SessionInfo[] {
        return results
            .filter(result => {
                const content = result.content || '';
                return content.includes(`Thread ID: ${threadId}`);
            })
            .map(result => {
                const content = result.content || '';
                const sessionMatch = content.match(/## Session ID: (session_[^\n]+)/);
                const titleMatch = content.match(/# Thread: ([^\n]+)/);
                const tokenMatch = content.match(/Token Usage.*?([0-9,]+)/);

                return {
                    sessionId: sessionMatch ? sessionMatch[1] : `session_${Date.now()}`,
                    threadId,
                    sessionTitle: titleMatch ? titleMatch[1] : 'Unknown Session',
                    timestamp: new Date(result.timestamp || Date.now()),
                    tokenCount: tokenMatch ? parseInt(tokenMatch[1].replace(/,/g, '')) : 0,
                    summary: content.substring(0, 200) + '...'
                };
            })
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    public async restoreThreadContext(threadId: string): Promise<boolean> {
        try {
            const sessions = await this.getSessionsForThread(threadId);
            if (sessions.length === 0) {
                vscode.window.showWarningMessage(`No sessions found for thread: ${threadId}`);
                return false;
            }

            this.currentThreadId = threadId;
            this.currentThreadTitle = sessions[0].sessionTitle;

            // Store in workspace state
            await this.context.workspaceState.update('claude-context.currentThreadId', this.currentThreadId);
            await this.context.workspaceState.update('claude-context.currentThreadTitle', this.currentThreadTitle);

            this.outputChannel.appendLine(`Restored thread context: ${threadId} - "${this.currentThreadTitle}"`);

            vscode.window.showInformationMessage(
                `Thread context restored: "${this.currentThreadTitle}" (${sessions.length} sessions)`
            );

            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to restore thread context: ${error}`);
            return false;
        }
    }

    public getCurrentThread(): { threadId: string | null; threadTitle: string | null } {
        return {
            threadId: this.currentThreadId,
            threadTitle: this.currentThreadTitle
        };
    }

    public async showThreadBrowser(): Promise<void> {
        try {
            const threads = await this.searchThreads(''); // Get all threads

            if (threads.length === 0) {
                vscode.window.showInformationMessage('No conversation threads found.');
                return;
            }

            const threadItems = threads.map(thread => ({
                label: thread.threadTitle,
                description: `${thread.sessionCount} sessions, last: ${thread.lastActivity.toLocaleDateString()}`,
                detail: thread.firstMessage,
                threadId: thread.threadId
            }));

            const selected = await vscode.window.showQuickPick(threadItems, {
                placeHolder: 'Select a conversation thread to restore or browse'
            });

            if (selected) {
                const action = await vscode.window.showQuickPick([
                    'Restore Thread Context',
                    'View Thread Sessions',
                    'Browse Thread Content'
                ], {
                    placeHolder: `Actions for: ${selected.label}`
                });

                switch (action) {
                    case 'Restore Thread Context':
                        await this.restoreThreadContext(selected.threadId);
                        break;
                    case 'View Thread Sessions':
                        await this.showThreadSessions(selected.threadId);
                        break;
                    case 'Browse Thread Content':
                        await this.showThreadContent(selected.threadId);
                        break;
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Thread browser failed: ${error}`);
        }
    }

    private async showThreadSessions(threadId: string): Promise<void> {
        const sessions = await this.getSessionsForThread(threadId);

        const sessionList = `# Thread Sessions\n\n**Thread ID**: ${threadId}\n**Total Sessions**: ${sessions.length}\n\n${sessions.map((session, index) => `
## Session ${index + 1}: ${session.sessionId}
- **Timestamp**: ${session.timestamp.toLocaleString()}
- **Tokens**: ${session.tokenCount.toLocaleString()}
- **Summary**: ${session.summary}
`).join('\n')}\n\n*Use "Claude Context: Search Memory" with Thread ID to restore specific sessions*`;

        const document = await vscode.workspace.openTextDocument({
            content: sessionList,
            language: 'markdown'
        });

        await vscode.window.showTextDocument(document);
    }

    private async showThreadContent(threadId: string): Promise<void> {
        // This would show the full thread content by combining all sessions
        // Implementation would depend on your specific MCP storage format
        vscode.window.showInformationMessage('Thread content browser - Feature coming soon!');
    }

    public dispose(): void {
        this.outputChannel?.dispose();
    }
}