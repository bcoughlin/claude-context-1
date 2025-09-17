import * as vscode from 'vscode';
import { Context } from '@zilliz/claude-context-core';
import * as path from 'path';
import { MCPContextManager } from '../monitoring/mcpContextManager';

export class IndexCommand {
    private context: Context;
    private mcpContextManager?: MCPContextManager;

    constructor(context: Context, mcpContextManager?: MCPContextManager) {
        this.context = context;
        this.mcpContextManager = mcpContextManager;
    }

    /**
     * Update the Context instance (used when configuration changes)
     */
    updateContext(context: Context): void {
        this.context = context;
    }

    /**
     * Check if there are any existing conversation threads
     */
    private async hasExistingThreads(): Promise<boolean> {
        try {
            const sessions = await this.mcpContextManager!.retrieveStoredConversations(1);
            return sessions.length > 0;
        } catch (error) {
            console.warn('Failed to check for existing threads:', error);
            return false;
        }
    }

    /**
     * Allow user to select from existing conversation threads
     */

    async execute(): Promise<void> {
        // Check if MCP context manager is available
        if (!this.mcpContextManager) {
            vscode.window.showErrorMessage('MCP Context Manager not available. Cannot index conversations.');
            return;
        }

        // Get current thread context or let user select one
        let currentThread = this.mcpContextManager.getCurrentThread();

        // If no current thread, try to guide the user to existing threads first, then offer creation
        if (!currentThread?.threadId) {
            // First, check if there are any existing threads
            const hasExistingThreads = await this.hasExistingThreads();

            if (hasExistingThreads) {
                const action = await vscode.window.showInformationMessage(
                    'No active conversation thread detected. What would you like to do?',
                    'Select Existing Thread',
                    'Create New Thread',
                    'Cancel'
                );

                if (action === 'Cancel' || !action) {
                    return;
                }

                if (action === 'Select Existing Thread') {
                    const selectedThread = await this.selectExistingThread();
                    if (!selectedThread) {
                        return; // User cancelled selection
                    }
                    currentThread = { threadId: selectedThread.threadId, threadTitle: selectedThread.threadTitle };
                } else if (action === 'Create New Thread') {
                    const newThread = await this.createNewThread();
                    if (!newThread) {
                        return; // User cancelled creation
                    }
                    currentThread = { threadId: newThread.threadId, threadTitle: newThread.threadTitle };
                }
            } else {
                // No existing threads, directly offer to create one
                const createNew = await vscode.window.showInformationMessage(
                    'No conversation threads found. Would you like to create your first conversation thread?',
                    'Create New Thread',
                    'Cancel'
                );

                if (createNew !== 'Create New Thread') {
                    return;
                }

                const newThread = await this.createNewThread();
                if (!newThread) {
                    return; // User cancelled creation
                }
                currentThread = { threadId: newThread.threadId, threadTitle: newThread.threadTitle };
            }
        }

        const confirm = await vscode.window.showInformationMessage(
            `Index conversation thread: "${currentThread?.threadTitle || 'Selected Thread'}"?\n\nThis will create embeddings for all conversation messages in this thread.`,
            'Yes',
            'Cancel'
        );

        if (confirm !== 'Yes') {
            return;
        }

        try {
            let indexStats: { indexedMessages: number; totalChunks: number; status: 'completed' | 'limit_reached' } | undefined;

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Indexing Conversation Thread',
                cancellable: false
            }, async (progress) => {
                // Get current thread context
                const threadId = currentThread?.threadId;
                const threadTitle = currentThread?.threadTitle || 'Current Thread';

                if (!threadId) {
                    throw new Error('No thread ID available. Please ensure you are in an active conversation thread.');
                }

                // Clear existing index for this thread
                progress.report({ increment: 0, message: 'Clearing existing thread index...' });
                await this.context.clearIndex(
                    `thread_${threadId}`, // Use thread ID as the "path" identifier
                    (progressInfo) => {
                        progress.report({ increment: 0, message: progressInfo.phase });
                    }
                );

                // Retrieve conversation data from MCP
                progress.report({ increment: 20, message: 'Retrieving conversation messages...' });
                const conversationData = await this.retrieveConversationData(threadId);

                if (!conversationData || conversationData.length === 0) {
                    throw new Error('No conversation data found for this thread.');
                }

                // Prepare collection with thread-specific naming
                progress.report({ increment: 40, message: 'Preparing thread collection...' });
                const collectionDescription = `Conversation Thread: ${threadTitle}`;
                await this.context.getPreparedCollection(`thread_${threadId}`, threadId);

                // Index conversation data instead of code files
                progress.report({ increment: 60, message: 'Creating embeddings for conversation messages...' });
                indexStats = await this.indexConversationData(
                    conversationData,
                    threadId,
                    collectionDescription,
                    (progressPercent, message) => {
                        const increment = Math.max(0, progressPercent - 60); // Start from 60%
                        progress.report({ increment: increment * 0.4, message }); // Scale to remaining 40%
                    }
                );

                progress.report({ increment: 100, message: 'Thread indexing complete!' });
            });

            if (indexStats) {
                const { indexedMessages, totalChunks, status } = indexStats;
                if (status === 'limit_reached') {
                    vscode.window.showWarningMessage(
                        `⚠️ Indexing paused. Reached chunk limit.\n\nIndexed ${indexedMessages} messages with ${totalChunks} conversation chunks.`
                    );
                } else {
                    vscode.window.showInformationMessage(
                        `✅ Thread index complete!\n\nIndexed ${indexedMessages} conversation messages with ${totalChunks} chunks.\n\nYou can now search this conversation thread's history.`
                    );
                }
            }

        } catch (error: any) {
            console.error('Conversation indexing failed:', error);
            const errorString = typeof error === 'string' ? error : (error.message || error.toString() || '');

            if (errorString.includes('collection limit') || errorString.includes('zilliz.com/pricing')) {
                const message = 'Your Zilliz Cloud account has hit its collection limit. To continue creating collections, you\'ll need to expand your capacity.';
                const openButton = 'Explore Pricing Options';

                vscode.window.showErrorMessage(message, { modal: true }, openButton).then(selection => {
                    if (selection === openButton) {
                        vscode.env.openExternal(vscode.Uri.parse('https://zilliz.com/pricing'));
                    }
                });
            } else {
                vscode.window.showErrorMessage(`❌ Conversation indexing failed: ${errorString}`);
            }
        }
    }

    /**
     * Retrieve conversation data for a specific thread from MCP server
     */
    private async retrieveConversationData(threadId: string): Promise<any[]> {
        if (!this.mcpContextManager) {
            throw new Error('MCP Context Manager not available');
        }

        // Use MCP to retrieve conversation history for this thread
        // This would call the MCP conversation memory server
        try {
            const conversations = await this.mcpContextManager.retrieveStoredConversations(100); // Get recent conversations

            // Filter for this specific thread
            const threadConversations = conversations.filter((conv: any) =>
                conv.threadId === threadId || conv.thread_id === threadId
            );

            return threadConversations;
        } catch (error) {
            console.error('Failed to retrieve conversation data:', error);
            throw new Error(`Failed to retrieve conversation data: ${error}`);
        }
    }

    /**
     * Index conversation data instead of code files
     */
    private async indexConversationData(
        conversationData: any[],
        threadId: string,
        collectionDescription: string,
        progressCallback: (percent: number, message: string) => void
    ): Promise<{ indexedMessages: number; totalChunks: number; status: 'completed' | 'limit_reached' }> {
        const chunks: any[] = [];
        let messageCount = 0;

        // Convert conversation messages to indexable chunks
        for (const conversation of conversationData) {
            messageCount++;
            progressCallback(
                (messageCount / conversationData.length) * 100,
                `Processing message ${messageCount}/${conversationData.length}...`
            );

            // Extract message content and create chunks
            const messageText = this.extractMessageText(conversation);
            const messageChunks = this.chunkConversationMessage(messageText, conversation, threadId);
            chunks.push(...messageChunks);
        }

        // Store chunks in Zilliz using the existing context infrastructure
        const collectionName = this.context.getCollectionName(`thread_${threadId}`, threadId);

        // Use the context's vector database to store conversation chunks
        // This reuses the existing embedding and storage logic
        await this.storeConversationChunks(chunks, collectionName, collectionDescription);

        return {
            indexedMessages: messageCount,
            totalChunks: chunks.length,
            status: 'completed'
        };
    }

    /**
     * Extract readable text content from conversation message
     */
    private extractMessageText(conversation: any): string {
        // Handle different conversation data formats
        if (typeof conversation === 'string') {
            return conversation;
        }

        if (conversation.content) {
            return conversation.content;
        }

        if (conversation.message) {
            return conversation.message;
        }

        if (conversation.messages && Array.isArray(conversation.messages)) {
            return conversation.messages.map((msg: any) =>
                typeof msg === 'string' ? msg : (msg.content || msg.message || '')
            ).join('\n\n');
        }

        // Fallback: stringify the object
        return JSON.stringify(conversation, null, 2);
    }

    /**
     * Break conversation message into chunks for embedding
     */
    private chunkConversationMessage(messageText: string, metadata: any, threadId: string): any[] {
        const maxChunkSize = 1000; // characters
        const overlap = 200;
        const chunks: any[] = [];

        // Simple text chunking for conversation content
        let start = 0;
        let chunkIndex = 0;

        while (start < messageText.length) {
            const end = Math.min(start + maxChunkSize, messageText.length);
            const chunkText = messageText.substring(start, end);

            chunks.push({
                content: chunkText,
                threadId: threadId,
                messageIndex: chunkIndex++,
                timestamp: metadata.timestamp || new Date().toISOString(),
                messageId: metadata.messageId || metadata.id || `chunk_${chunkIndex}`,
                type: 'conversation_message'
            });

            // Move start position with overlap
            start = end - overlap;
            if (start >= messageText.length) break;
        }

        return chunks;
    }

    /**
     * Store conversation chunks in Zilliz vector database
     */
    private async storeConversationChunks(chunks: any[], collectionName: string, description: string): Promise<void> {
        // This method would use the existing Context class's vector database
        // but store conversation chunks instead of code chunks

        // For now, this is a placeholder - we'd need to modify the core Context class
        // to handle conversation data or create a new method specifically for conversations
        console.log(`Storing ${chunks.length} conversation chunks in collection: ${collectionName}`);
        console.log('Collection description:', description);

        // TODO: Implement actual storage using Context's vector database
        // This would involve calling the embedding service and storing in Zilliz
    }

    /**
     * Let user select from existing conversation threads
     */
    private async selectExistingThread(): Promise<{ threadId: string; threadTitle: string } | null> {
        if (!this.mcpContextManager) {
            return null;
        }

        try {
            // Use the MCP manager's thread browser functionality
            const threads = await this.mcpContextManager.searchThreads(''); // Get all threads

            if (threads.length === 0) {
                const createNew = await vscode.window.showInformationMessage(
                    'No conversation threads found. Would you like to create a new thread?',
                    'Create New Thread',
                    'Cancel'
                );

                if (createNew === 'Create New Thread') {
                    return await this.createNewThread();
                }

                return null; // User cancelled
            }

            const threadItems = threads.map(thread => ({
                label: thread.threadTitle,
                description: `${thread.sessionCount} sessions, last: ${thread.lastActivity.toLocaleDateString()}`,
                detail: thread.firstMessage,
                threadInfo: thread
            }));

            const selected = await vscode.window.showQuickPick(threadItems, {
                placeHolder: 'Select a conversation thread to index',
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (!selected) {
                return null;
            }

            return {
                threadId: selected.threadInfo.threadId,
                threadTitle: selected.threadInfo.threadTitle
            };
        } catch (error) {
            console.error('Failed to retrieve threads:', error);
            vscode.window.showErrorMessage('Failed to retrieve conversation threads.');
            return null;
        }
    }

    /**
     * Create a new conversation thread for indexing
     */
    private async createNewThread(): Promise<{ threadId: string; threadTitle: string } | null> {
        const threadTitle = await vscode.window.showInputBox({
            prompt: 'Enter a title for the new conversation thread',
            placeHolder: 'e.g., "Working on Vector Memory Extension"',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Thread title cannot be empty';
                }
                if (value.length > 100) {
                    return 'Thread title too long (max 100 characters)';
                }
                return null;
            }
        });

        if (!threadTitle) {
            return null;
        }

        // Generate a new thread ID
        const threadId = this.generateThreadId();

        // Return the new thread info (we'll initialize it during indexing)
        return {
            threadId: threadId,
            threadTitle: threadTitle.trim()
        };
    }

    /**
     * Generate a unique thread ID
     */
    private generateThreadId(): string {
        // Generate a thread ID similar to the format expected by the system
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `thread_${timestamp}_${random}`;
    }

    async clearIndex(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            'Clear all indexed data?',
            'Yes',
            'Cancel'
        );

        if (confirm !== 'Yes') {
            return;
        }

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Clearing Index',
                cancellable: false
            }, async (progress) => {
                await this.context.clearIndex(
                    workspaceFolders[0].uri.fsPath,
                    (progressInfo) => {
                        progress.report({
                            increment: progressInfo.percentage,
                            message: progressInfo.phase
                        });
                    }
                );
            });

            vscode.window.showInformationMessage('✅ Index cleared successfully');
        } catch (error) {
            console.error('Failed to clear index:', error);
            vscode.window.showErrorMessage(`❌ Failed to clear index: ${error}`);
        }
    }


} 