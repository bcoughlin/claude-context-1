import * as vscode from 'vscode';
import { TokenMonitor, TokenUsageData, ChatMessage, SearchResult, FileModification } from './tokenMonitor';

export interface APIResponseData {
    usage?: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
    };
    model?: string;
    id?: string;
    timestamp?: string;
}

export class ChatResponseInterceptor {
    private tokenMonitor: TokenMonitor;
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;
    private isMonitoring = false;
    private disposables: vscode.Disposable[] = [];

    constructor(tokenMonitor: TokenMonitor, context: vscode.ExtensionContext) {
        this.tokenMonitor = tokenMonitor;
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('Claude Chat Interceptor');
    }

    public startMonitoring(): void {
        if (this.isMonitoring) {
            return;
        }

        this.isMonitoring = true;
        this.outputChannel.appendLine('Starting chat response monitoring...');

        // Method 1: Hook into VS Code's language model APIs
        this.setupLanguageModelHook();

        // Method 2: Monitor network requests (if possible)
        this.setupNetworkMonitoring();

        // Method 3: Monitor workspace changes that indicate AI activity
        this.setupWorkspaceMonitoring();

        // Method 4: Hook into chat participant API
        this.setupChatParticipantHook();
    }

    public stopMonitoring(): void {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.outputChannel.appendLine('Stopped chat response monitoring');
    }

    private setupLanguageModelHook(): void {
        try {
            // Hook into the language model token counting API
            // Based on VS Code's ExtHostLanguageModels patterns

            // This is a simplified approach - the actual implementation would need
            // to intercept the internal language model calls
            this.outputChannel.appendLine('Language model hook setup attempted');

            // For now, we'll use a periodic check approach
            const interval = setInterval(() => {
                this.checkForRecentActivity();
            }, 5000); // Check every 5 seconds

            this.disposables.push({
                dispose: () => clearInterval(interval)
            });

        } catch (error) {
            this.outputChannel.appendLine(`Language model hook failed: ${error}`);
        }
    }

    private async checkForRecentActivity(): Promise<void> {
        // Check for indicators of recent AI activity
        try {
            const recentChanges = await this.detectRecentChanges();
            if (recentChanges.hasActivity) {
                this.estimateAndRecordTokenUsage(recentChanges);
            }
        } catch (error) {
            // Silent fail for periodic checks
        }
    }

    private async detectRecentChanges(): Promise<{ hasActivity: boolean, changes: any }> {
        const now = Date.now();
        const recentThreshold = 10000; // 10 seconds

        // Check for recent document changes
        const hasRecentEdits = vscode.workspace.textDocuments.some(doc => {
            // This is a simplified check - would need more sophisticated detection
            return doc.isDirty;
        });

        // Check for recent command executions (if we can track them)
        // This would require more advanced hooking

        return {
            hasActivity: hasRecentEdits,
            changes: {
                documentEdits: hasRecentEdits,
                timestamp: now
            }
        };
    }

    private estimateAndRecordTokenUsage(changes: any): void {
        // Estimate token usage based on activity
        // This is a fallback when we can't intercept actual API responses

        const estimatedTokens = this.estimateTokensFromActivity(changes);

        if (estimatedTokens > 0) {
            const tokenUsage: TokenUsageData = {
                input_tokens: Math.floor(estimatedTokens * 0.3), // Rough estimate
                output_tokens: Math.floor(estimatedTokens * 0.7),
                total_tokens: estimatedTokens,
                timestamp: new Date(),
                model: 'estimated'
            };

            this.tokenMonitor.addTokenUsage(tokenUsage);
            this.outputChannel.appendLine(`Estimated token usage: ${estimatedTokens} tokens`);
        }
    }

    private estimateTokensFromActivity(changes: any): number {
        // Very rough estimation based on activity
        // In practice, this would need much more sophisticated logic

        let estimate = 0;

        if (changes.documentEdits) {
            estimate += 1000; // Base estimate for document changes
        }

        // Add estimates for other types of activity

        return estimate;
    }

    private setupNetworkMonitoring(): void {
        try {
            // In a real implementation, this would try to hook into
            // network requests to the Claude API

            // For VS Code extensions, direct network interception is limited
            // This would require a different approach, possibly using:
            // 1. Proxy detection
            // 2. File system monitoring for API logs
            // 3. Extension API hooks

            this.outputChannel.appendLine('Network monitoring setup attempted (limited in VS Code)');

        } catch (error) {
            this.outputChannel.appendLine(`Network monitoring failed: ${error}`);
        }
    }

    private setupWorkspaceMonitoring(): void {
        try {
            // Monitor for changes that indicate AI-generated content
            const docChangeDisposable = vscode.workspace.onDidChangeTextDocument(event => {
                this.handleDocumentChange(event);
            });

            const saveDisposable = vscode.workspace.onDidSaveTextDocument(document => {
                this.handleDocumentSave(document);
            });

            this.disposables.push(docChangeDisposable, saveDisposable);
            this.outputChannel.appendLine('Workspace monitoring setup completed');

        } catch (error) {
            this.outputChannel.appendLine(`Workspace monitoring failed: ${error}`);
        }
    }

    private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
        // Track document changes that might indicate AI activity
        const changes = event.contentChanges;

        if (changes.length > 0) {
            const totalCharsAdded = changes.reduce((sum, change) => sum + change.text.length, 0);

            // If large amounts of text are added quickly, it might be AI-generated
            if (totalCharsAdded > 100) {
                const fileModification: FileModification = {
                    path: vscode.workspace.asRelativePath(event.document.uri),
                    purpose: `Large text addition: ${totalCharsAdded} characters`,
                    timestamp: new Date()
                };

                this.tokenMonitor.addFileModification(fileModification);
            }
        }
    }

    private handleDocumentSave(document: vscode.TextDocument): void {
        if (!document.isUntitled) {
            const fileModification: FileModification = {
                path: vscode.workspace.asRelativePath(document.uri),
                purpose: 'Document saved',
                timestamp: new Date()
            };

            this.tokenMonitor.addFileModification(fileModification);
        }
    }

    private setupChatParticipantHook(): void {
        try {
            // Register a chat participant to intercept chat interactions
            // This is based on VS Code's chat API patterns

            const participant = vscode.chat.createChatParticipant(
                'claude-context.monitor',
                this.handleChatRequest.bind(this)
            );

            participant.iconPath = vscode.Uri.file('resources/icon.png');

            this.disposables.push(participant);
            this.outputChannel.appendLine('Chat participant hook setup completed');

        } catch (error) {
            this.outputChannel.appendLine(`Chat participant hook failed: ${error}`);
        }
    }

    private async handleChatRequest(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<void> {
        try {
            // This function intercepts chat requests
            const userMessage: ChatMessage = {
                timestamp: new Date(),
                type: 'user',
                content: request.prompt,
                tokenUsage: {
                    input_tokens: this.estimateTokensFromText(request.prompt),
                    output_tokens: 0,
                    total_tokens: this.estimateTokensFromText(request.prompt),
                    timestamp: new Date()
                }
            };

            this.tokenMonitor.addChatMessage(userMessage);

            // Track the request for later response correlation
            this.trackChatRequest(request, context);

            this.outputChannel.appendLine(`Chat request intercepted: ${request.prompt.length} chars`);

        } catch (error) {
            this.outputChannel.appendLine(`Chat request handling failed: ${error}`);
        }
    }

    private provideFollowups(
        result: vscode.ChatResult,
        context: vscode.ChatContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.ChatFollowup[]> {
        // Provide followup suggestions and track the result
        if (result) {
            this.trackChatResult(result);
        }

        return [
            {
                prompt: 'Show token usage statistics',
                label: '📊 Token Stats'
            },
            {
                prompt: 'Store current context',
                label: '💾 Store Context'
            }
        ];
    }

    private trackChatRequest(request: vscode.ChatRequest, context: vscode.ChatContext): void {
        // Store request information for response correlation
        const requestData = {
            prompt: request.prompt,
            timestamp: new Date(),
            contextSize: JSON.stringify(context).length
        };

        // Store temporarily for correlation with response
        this.context.workspaceState.update(`chat-request-${Date.now()}`, requestData);
    }

    private trackChatResult(result: vscode.ChatResult): void {
        // Track the chat result/response
        try {
            const assistantMessage: ChatMessage = {
                timestamp: new Date(),
                type: 'assistant',
                content: 'Chat response received', // Actual content might not be accessible
                tokenUsage: {
                    input_tokens: 0,
                    output_tokens: this.estimateOutputTokens(result),
                    total_tokens: this.estimateOutputTokens(result),
                    timestamp: new Date()
                }
            };

            this.tokenMonitor.addChatMessage(assistantMessage);
            this.outputChannel.appendLine('Chat response tracked');

        } catch (error) {
            this.outputChannel.appendLine(`Chat result tracking failed: ${error}`);
        }
    }

    private estimateTokensFromText(text: string): number {
        // Rough estimation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }

    private estimateOutputTokens(result: vscode.ChatResult): number {
        // Estimate based on result metadata if available
        // This is a fallback when actual token counts aren't accessible
        return 500; // Conservative estimate
    }

    // Method to manually record API response (for when we can capture them)
    public recordAPIResponse(responseData: APIResponseData): void {
        if (responseData.usage) {
            const tokenUsage: TokenUsageData = {
                input_tokens: responseData.usage.input_tokens,
                output_tokens: responseData.usage.output_tokens,
                total_tokens: responseData.usage.total_tokens,
                timestamp: new Date(),
                model: responseData.model,
                request_id: responseData.id
            };

            this.tokenMonitor.addTokenUsage(tokenUsage);

            this.outputChannel.appendLine(
                `API Response recorded: ${tokenUsage.total_tokens} tokens (${tokenUsage.input_tokens}+${tokenUsage.output_tokens})`
            );
        }
    }

    // Method for external tools to record search operations
    public recordSearchOperation(operation: SearchResult): void {
        this.tokenMonitor.addSearchResult(operation);
        this.outputChannel.appendLine(`Search operation recorded: ${operation.tool} - "${operation.query}"`);
    }

    public dispose(): void {
        this.stopMonitoring();
        this.outputChannel?.dispose();
    }
}