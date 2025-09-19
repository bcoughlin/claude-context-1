import * as vscode from 'vscode';

export interface TokenUsageData {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    timestamp: Date;
    model?: string;
    request_id?: string;
}

export interface ConversationSnapshot {
    tokenCount: number;
    sessionDuration: string;
    activeFiles: string[];
    gitStatus: string;
    searchResults: SearchResult[];
    messages: ChatMessage[];
    filesModified: FileModification[];
    workspaceContext: any;
}

export interface SearchResult {
    tool: string;
    query: string;
    source: string;
    results: string;
    impact: string;
    timestamp: Date;
}

export interface ChatMessage {
    timestamp: Date;
    type: 'user' | 'assistant' | 'system';
    content: string;
    tokenUsage?: TokenUsageData;
}

export interface FileModification {
    path: string;
    purpose: string;
    timestamp: Date;
}

export class TokenMonitor {
    private currentTokens = 0;
    private sessionStartTime = new Date();
    private statusBarItem!: vscode.StatusBarItem;
    private languageStatusItem!: vscode.LanguageStatusItem;
    private chatHistory: ChatMessage[] = [];
    private searchHistory: SearchResult[] = [];
    private fileModifications: FileModification[] = [];
    private context: vscode.ExtensionContext;
    private activeThreadId: string | null = null;
    private activeThreadTitle: string | null = null;
    private mcpContextManager?: any; // Will be injected

    // Configuration thresholds
    private criticalThreshold = 125000; // 62.5% of 200k
    private warningThreshold = 140000;  // 70% of 200k
    private maxTokens = 200000;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.initializeStatusIndicators();
        this.loadConfiguration();
        this.restoreSessionState();
    }

    private initializeStatusIndicators(): void {
        // Create status bar indicator (visible on right side)
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'claude-context.showTokenStats';
        this.statusBarItem.show();

        // Create language status indicator for detailed context
        this.languageStatusItem = vscode.languages.createLanguageStatusItem(
            'claude-context.tokenStatus',
            { language: '*' }
        );
        this.languageStatusItem.command = {
            title: 'Manage Context',
            command: 'claude-context.manageContext'
        };

        this.updateStatusDisplay();
    }

    private loadConfiguration(): void {
        const config = vscode.workspace.getConfiguration('claude-context');
        this.criticalThreshold = config.get('criticalThreshold', 125000);
        this.warningThreshold = config.get('warningThreshold', 140000);
        this.maxTokens = config.get('maxTokens', 200000);
    }

    private restoreSessionState(): void {
        // Restore token count from workspace state
        const savedTokens = this.context.workspaceState.get('claude-context.currentTokens', 0);
        const savedStartTime = this.context.workspaceState.get('claude-context.sessionStartTime') as string;
        const savedThreadId = this.context.workspaceState.get('claude-context.activeThreadId') as string;
        const savedThreadTitle = this.context.workspaceState.get('claude-context.activeThreadTitle') as string;

        this.currentTokens = savedTokens;
        this.activeThreadId = savedThreadId || null;
        this.activeThreadTitle = savedThreadTitle || null;

        if (savedStartTime) {
            this.sessionStartTime = new Date(savedStartTime);
        }

        this.updateStatusDisplay();
    }

    public setMCPContextManager(mcpContextManager: any): void {
        this.mcpContextManager = mcpContextManager;
    }

    public setActiveThread(threadId: string, threadTitle: string): void {
        this.activeThreadId = threadId;
        this.activeThreadTitle = threadTitle;

        // Store in workspace state
        this.context.workspaceState.update('claude-context.activeThreadId', threadId);
        this.context.workspaceState.update('claude-context.activeThreadTitle', threadTitle);

        // Reset token count for new thread
        this.currentTokens = 0;
        this.sessionStartTime = new Date();
        this.context.workspaceState.update('claude-context.currentTokens', 0);
        this.context.workspaceState.update('claude-context.sessionStartTime', this.sessionStartTime.toISOString());

        this.updateStatusDisplay();

        vscode.window.showInformationMessage(
            `Token monitoring active for thread: "${threadTitle}"`
        );
    }

    public getActiveThread(): { threadId: string | null; threadTitle: string | null } {
        return {
            threadId: this.activeThreadId,
            threadTitle: this.activeThreadTitle
        };
    }

    public clearActiveThread(): void {
        this.activeThreadId = null;
        this.activeThreadTitle = null;
        this.currentTokens = 0;

        this.context.workspaceState.update('claude-context.activeThreadId', undefined);
        this.context.workspaceState.update('claude-context.activeThreadTitle', undefined);
        this.context.workspaceState.update('claude-context.currentTokens', 0);

        this.updateStatusDisplay();
    }

    public addTokenUsage(usage: TokenUsageData): void {
        // Only track tokens if we have an active thread
        if (!this.activeThreadId) {
            // Don't track tokens without active thread
            return;
        }

        this.currentTokens += usage.total_tokens;

        // Store the usage data
        this.context.workspaceState.update('claude-context.currentTokens', this.currentTokens);

        this.updateStatusDisplay();
        this.checkThresholds();

        // Log to output channel for debugging
        this.logTokenUsage(usage);
    }

    public addChatMessage(message: ChatMessage): void {
        this.chatHistory.push(message);

        if (message.tokenUsage) {
            this.addTokenUsage(message.tokenUsage);
        }
    }

    public addSearchResult(result: SearchResult): void {
        this.searchHistory.push(result);
    }

    public addFileModification(modification: FileModification): void {
        this.fileModifications.push(modification);
    }

    private updateStatusDisplay(): void {
        const percentage = (this.currentTokens / this.maxTokens) * 100;
        const color = this.getStatusColor(percentage);

        // Show different display based on whether we have an active thread
        if (!this.activeThreadId) {
            // No active thread
            this.statusBarItem.text = `$(symbol-misc) No Active Thread`;
            this.statusBarItem.tooltip = `Claude Context: No active conversation thread\nUse "Set Active Thread" to start tracking`;
            this.statusBarItem.color = '#888888'; // Gray

            this.languageStatusItem.text = `No active thread`;
            this.languageStatusItem.detail = `Set active thread to start token monitoring`;
            this.languageStatusItem.severity = vscode.LanguageStatusSeverity.Information;
        } else {
            // Active thread - show token count
            this.statusBarItem.text = `$(symbol-misc) ${this.currentTokens.toLocaleString()} tokens (${percentage.toFixed(1)}%)`;
            this.statusBarItem.tooltip = `Claude Context: ${this.currentTokens} / ${this.maxTokens.toLocaleString()} tokens\nThread: "${this.activeThreadTitle}"\nClick for details`;
            this.statusBarItem.color = color;

            this.languageStatusItem.text = `${this.currentTokens.toLocaleString()} tokens`;
            this.languageStatusItem.detail = `${percentage.toFixed(1)}% of context window used | Thread: "${this.activeThreadTitle}"`;
            this.languageStatusItem.severity = this.getLanguageStatusSeverity(percentage);
        }
    }

    private getStatusColor(percentage: number): string {
        if (percentage >= 70) return '#ff6b6b'; // Red
        if (percentage >= 62.5) return '#ffa500'; // Orange  
        if (percentage >= 50) return '#ffeb3b'; // Yellow
        return '#ffffff'; // White
    }

    private getLanguageStatusSeverity(percentage: number): vscode.LanguageStatusSeverity {
        if (percentage >= 70) return vscode.LanguageStatusSeverity.Error;
        if (percentage >= 62.5) return vscode.LanguageStatusSeverity.Warning;
        return vscode.LanguageStatusSeverity.Information;
    }

    private async checkThresholds(): Promise<void> {
        const percentage = (this.currentTokens / this.maxTokens) * 100;

        if (this.currentTokens >= this.warningThreshold) {
            await this.handleCriticalThreshold();
        } else if (this.currentTokens >= this.criticalThreshold) {
            await this.handleWarningThreshold();
        }
    }

    private async handleWarningThreshold(): Promise<void> {
        const config = vscode.workspace.getConfiguration('claude-context');
        const autoStore = config.get('autoStore', true);

        if (autoStore) {
            const selection = await vscode.window.showWarningMessage(
                `Token usage at WARNING level (${this.currentTokens.toLocaleString()} tokens, ${((this.currentTokens / this.maxTokens) * 100).toFixed(1)}%). Consider storing conversation context.`,
                'Store Now',
                'Remind Later',
                'Settings'
            );

            await this.handleThresholdAction(selection);
        }
    }

    private async handleCriticalThreshold(): Promise<void> {
        const selection = await vscode.window.showErrorMessage(
            `Token usage at CRITICAL level (${this.currentTokens.toLocaleString()} tokens, ${((this.currentTokens / this.maxTokens) * 100).toFixed(1)}%). Automatic summarization imminent!`,
            'Store Now',
            'Reset Counter',
            'Settings'
        );

        await this.handleThresholdAction(selection);
    }

    private async handleThresholdAction(selection: string | undefined): Promise<void> {
        switch (selection) {
            case 'Store Now':
                await this.storeCurrentContext();
                break;
            case 'Reset Counter':
                await this.resetTokenCounter();
                break;
            case 'Settings':
                await vscode.commands.executeCommand('workbench.action.openSettings', 'claude-context');
                break;
        }
    }

    public async storeCurrentContext(): Promise<void> {
        try {
            const snapshot = await this.createConversationSnapshot();

            // Emit event for MCP integration to handle
            vscode.commands.executeCommand('claude-context.storeConversation', snapshot);

            vscode.window.showInformationMessage(
                `Context stored successfully. ${this.currentTokens.toLocaleString()} tokens saved.`
            );

        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to store context: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    public async resetTokenCounter(): Promise<void> {
        const selection = await vscode.window.showWarningMessage(
            'Reset token counter? This will start fresh token tracking.',
            'Reset',
            'Cancel'
        );

        if (selection === 'Reset') {
            this.currentTokens = 0;
            this.sessionStartTime = new Date();
            this.chatHistory = [];
            this.searchHistory = [];
            this.fileModifications = [];

            // Clear workspace state
            await this.context.workspaceState.update('claude-context.currentTokens', 0);
            await this.context.workspaceState.update('claude-context.sessionStartTime', this.sessionStartTime.toISOString());

            this.updateStatusDisplay();

            vscode.window.showInformationMessage('Token counter reset successfully.');
        }
    }

    public async showDetailedStats(): Promise<void> {
        const percentage = (this.currentTokens / this.maxTokens) * 100;
        const sessionDuration = this.getSessionDuration();

        const stats = `
# Claude Context Statistics

**Current Usage**: ${this.currentTokens.toLocaleString()} / ${this.maxTokens.toLocaleString()} tokens (${percentage.toFixed(2)}%)

**Session Duration**: ${sessionDuration}

**Thresholds**:
- Critical: ${this.criticalThreshold.toLocaleString()} tokens (${((this.criticalThreshold / this.maxTokens) * 100).toFixed(1)}%)
- Warning: ${this.warningThreshold.toLocaleString()} tokens (${((this.warningThreshold / this.maxTokens) * 100).toFixed(1)}%)

**Activity Summary**:
- Chat Messages: ${this.chatHistory.length}
- Search Operations: ${this.searchHistory.length}
- Files Modified: ${this.fileModifications.length}

**Recent Activity**:
${this.getRecentActivitySummary()}
        `;

        const document = await vscode.workspace.openTextDocument({
            content: stats,
            language: 'markdown'
        });

        await vscode.window.showTextDocument(document);
    }

    private async createConversationSnapshot(): Promise<ConversationSnapshot> {
        const workspaceInfo = await this.gatherWorkspaceContext();

        return {
            tokenCount: this.currentTokens,
            sessionDuration: this.getSessionDuration(),
            activeFiles: await this.getActiveFiles(),
            gitStatus: await this.getGitStatus(),
            searchResults: this.searchHistory,
            messages: this.chatHistory,
            filesModified: this.fileModifications,
            workspaceContext: workspaceInfo
        };
    }

    private getSessionDuration(): string {
        const now = new Date();
        const diffMs = now.getTime() - this.sessionStartTime.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    }

    private async getActiveFiles(): Promise<string[]> {
        const openDocuments = vscode.workspace.textDocuments
            .filter(doc => !doc.isUntitled && doc.uri.scheme === 'file')
            .map(doc => vscode.workspace.asRelativePath(doc.uri));

        return openDocuments;
    }

    private async getGitStatus(): Promise<string> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return 'No workspace';

            // Basic git status - could be enhanced with git extension API
            return 'Git status available'; // Placeholder
        } catch (error) {
            return 'Git status unavailable';
        }
    }

    private async gatherWorkspaceContext(): Promise<any> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        return {
            workspaceName: workspaceFolder?.name || 'Unknown',
            workspacePath: workspaceFolder?.uri.fsPath || '',
            activeEditor: vscode.window.activeTextEditor?.document.fileName,
            openEditors: vscode.window.visibleTextEditors.length,
            timestamp: new Date().toISOString()
        };
    }

    private getRecentActivitySummary(): string {
        const recentMessages = this.chatHistory.slice(-3);
        const recentSearches = this.searchHistory.slice(-3);

        let summary = '';

        if (recentMessages.length > 0) {
            summary += '\n**Recent Messages**:\n';
            recentMessages.forEach(msg => {
                summary += `- [${msg.timestamp.toLocaleTimeString()}] ${msg.type}: ${msg.content.substring(0, 100)}...\n`;
            });
        }

        if (recentSearches.length > 0) {
            summary += '\n**Recent Searches**:\n';
            recentSearches.forEach(search => {
                summary += `- [${search.timestamp.toLocaleTimeString()}] ${search.tool}: "${search.query}"\n`;
            });
        }

        return summary || 'No recent activity';
    }

    private logTokenUsage(usage: TokenUsageData): void {
        const outputChannel = vscode.window.createOutputChannel('Claude Context Monitor');
        outputChannel.appendLine(
            `[${new Date().toISOString()}] Token Usage: +${usage.total_tokens} (input: ${usage.input_tokens}, output: ${usage.output_tokens}) | Total: ${this.currentTokens}`
        );
    }

    public dispose(): void {
        this.statusBarItem?.dispose();
        this.languageStatusItem?.dispose();
    }
}