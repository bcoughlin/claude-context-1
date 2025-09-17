import * as vscode from 'vscode';
import { SemanticSearchViewProvider } from './webview/semanticSearchProvider';

import { SearchCommand } from './commands/searchCommand';
import { IndexCommand } from './commands/indexCommand';
import { SyncCommand } from './commands/syncCommand';
import { ConfigManager } from './config/configManager';
import { Context, OpenAIEmbedding, VoyageAIEmbedding, GeminiEmbedding, MilvusRestfulVectorDatabase, AstCodeSplitter, LangChainCodeSplitter, SplitterType } from '@zilliz/claude-context-core';
import { envManager } from '@zilliz/claude-context-core';

// Token monitoring imports
import { TokenMonitor } from './monitoring/tokenMonitor';
import { MCPContextManager } from './monitoring/mcpContextManager';
import { ChatResponseInterceptor } from './monitoring/chatResponseInterceptor';

let semanticSearchProvider: SemanticSearchViewProvider;
let searchCommand: SearchCommand;
let indexCommand: IndexCommand;
let syncCommand: SyncCommand;
let configManager: ConfigManager;
let codeContext: Context;
let autoSyncDisposable: vscode.Disposable | null = null;

// Token monitoring instances
let tokenMonitor: TokenMonitor;
let mcpContextManager: MCPContextManager;
let chatInterceptor: ChatResponseInterceptor;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Context extension is now active!');

    // Initialize config manager
    configManager = new ConfigManager(context);

    // Initialize shared context instance with embedding configuration
    codeContext = createContextWithConfig(configManager);

    // Initialize token monitoring system
    tokenMonitor = new TokenMonitor(context);
    mcpContextManager = new MCPContextManager(context);
    chatInterceptor = new ChatResponseInterceptor(tokenMonitor, context);

    // Initialize providers and commands
    searchCommand = new SearchCommand(codeContext, mcpContextManager);
    indexCommand = new IndexCommand(codeContext, mcpContextManager);
    syncCommand = new SyncCommand(codeContext);
    semanticSearchProvider = new SemanticSearchViewProvider(context.extensionUri, searchCommand, indexCommand, syncCommand, configManager);

    // Register command handlers
    const disposables = [
        // Register webview providers
        vscode.window.registerWebviewViewProvider(SemanticSearchViewProvider.viewType, semanticSearchProvider, {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }),

        // Register configuration changes listener
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('vectorMemory.embeddingProvider') ||
                event.affectsConfiguration('vectorMemory.milvus') ||
                event.affectsConfiguration('vectorMemory.splitter') ||
                event.affectsConfiguration('vectorMemory.autoSync')) {
                console.log('Context configuration changed, reloading...');
                reloadContextConfiguration();
            }

            if (event.affectsConfiguration('claude-context')) {
                console.log('Token monitoring configuration changed, reloading...');
                // Recreate token monitor with new configuration
                tokenMonitor.dispose();
                tokenMonitor = new TokenMonitor(context);
            }
        }),

        // Register existing semantic search commands
        vscode.commands.registerCommand('vectorMemory.semanticSearch', () => {
            // Get selected text from active editor and track the search
            const editor = vscode.window.activeTextEditor;
            const selectedText = editor?.document.getText(editor.selection);

            // Record search operation for token monitoring
            if (selectedText) {
                chatInterceptor.recordSearchOperation({
                    tool: 'Semantic Search',
                    query: selectedText,
                    source: 'VSCode Extension',
                    results: 'Search executed',
                    impact: 'Code search performed',
                    timestamp: new Date()
                });
            }

            return searchCommand.execute(selectedText);
        }),
        vscode.commands.registerCommand('vectorMemory.indexThread', () => {
            // Record indexing operation
            chatInterceptor.recordSearchOperation({
                tool: 'Index Current Thread',
                query: 'Thread-specific indexing',
                source: 'VSCode Extension',
                results: 'Indexing started',
                impact: 'Codebase indexed for search',
                timestamp: new Date()
            });
            return indexCommand.execute();
        }),
        vscode.commands.registerCommand('vectorMemory.clearIndex', () => indexCommand.clearIndex()),
        vscode.commands.registerCommand('vectorMemory.reloadConfiguration', () => reloadContextConfiguration()),

        // Register token monitoring commands
        vscode.commands.registerCommand('claude-context.showTokenStats', () => tokenMonitor.showDetailedStats()),
        vscode.commands.registerCommand('claude-context.storeContext', () => tokenMonitor.storeCurrentContext()),
        vscode.commands.registerCommand('claude-context.resetCounter', () => tokenMonitor.resetTokenCounter()),
        vscode.commands.registerCommand('claude-context.manageContext', () => showContextManagementOptions()),
        vscode.commands.registerCommand('claude-context.searchMemory', () => searchConversationMemory()),
        vscode.commands.registerCommand('claude-context.validateMCP', () => validateMCPConnection()),

        // Debug command for thread detection
        vscode.commands.registerCommand('vectorMemory.debugThreads', async () => {
            const output = vscode.window.createOutputChannel('Vector Memory Debug');
            output.clear();
            output.show();

            output.appendLine('=== THREAD DETECTION DEBUG ===');
            output.appendLine(`Timestamp: ${new Date().toISOString()}`);
            output.appendLine('');

            // Test MCP Context Manager
            output.appendLine('1. Testing MCP Context Manager...');
            if (!mcpContextManager) {
                output.appendLine('❌ MCP Context Manager is null/undefined');
                return;
            }
            output.appendLine('✅ MCP Context Manager exists');

            // Test current thread detection
            output.appendLine('');
            output.appendLine('2. Testing current thread detection...');
            const currentThread = mcpContextManager.getCurrentThread();
            output.appendLine(`Current Thread ID: ${currentThread?.threadId || 'null'}`);
            output.appendLine(`Current Thread Title: ${currentThread?.threadTitle || 'null'}`);

            // Test MCP connection and thread retrieval
            output.appendLine('');
            output.appendLine('3. Testing MCP thread retrieval...');
            try {
                const threads = await mcpContextManager.searchThreads('');
                output.appendLine(`✅ MCP searchThreads successful`);
                output.appendLine(`Found ${threads.length} threads`);

                if (threads.length > 0) {
                    output.appendLine('');
                    output.appendLine('Available threads:');
                    threads.forEach((thread, index) => {
                        output.appendLine(`  ${index + 1}. "${thread.threadTitle}" (ID: ${thread.threadId})`);
                        output.appendLine(`     Sessions: ${thread.sessionCount}, Last: ${thread.lastActivity.toLocaleDateString()}`);
                    });
                } else {
                    output.appendLine('ℹ️ No threads found in storage');
                }
            } catch (error) {
                output.appendLine(`❌ MCP searchThreads failed: ${error}`);
            }

            // Test MCP configuration
            output.appendLine('');
            output.appendLine('4. Testing MCP configuration...');
            const config = vscode.workspace.getConfiguration('claude-context');
            output.appendLine(`MCP Enabled: ${config.get('mcp.enabled', false)}`);
            output.appendLine(`MCP Server URI: ${config.get('mcp.serverUri', 'default')}`);
            output.appendLine(`MCP Transport: ${config.get('mcp.transport', 'stdio')}`);

            output.appendLine('');
            output.appendLine('=== DEBUG COMPLETE ===');
        }),

        // Register thread management commands
        vscode.commands.registerCommand('claude-context.browseThreads', () => mcpContextManager.showThreadBrowser()),
        vscode.commands.registerCommand('claude-context.searchThreads', () => searchThreads()),
        vscode.commands.registerCommand('claude-context.newThread', () => createNewThread()),
        vscode.commands.registerCommand('claude-context.showCurrentThread', () => showCurrentThread()),

        // Register MCP storage handler
        vscode.commands.registerCommand('claude-context.storeConversation', (snapshot) => {
            return mcpContextManager.storeConversation(snapshot);
        })
    ];

    context.subscriptions.push(...disposables);

    // Initialize auto-sync if enabled
    setupAutoSync();

    // Run initial sync on startup
    runInitialSync();

    // Start token monitoring
    chatInterceptor.startMonitoring();
    console.log('Token monitoring system activated');

    // Show status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = `$(search) Context`;
    statusBarItem.tooltip = 'Click to open semantic search';
    statusBarItem.command = 'vectorMemory.semanticSearch';
    statusBarItem.show();

    context.subscriptions.push(statusBarItem);
}

async function runInitialSync() {
    try {
        console.log('[STARTUP] Running initial sync...');
        await syncCommand.executeSilent();
        console.log('[STARTUP] Initial sync completed');
    } catch (error) {
        console.error('[STARTUP] Initial sync failed:', error);
        // Don't show error message to user for startup sync failure
    }
}

function setupAutoSync() {
    const config = vscode.workspace.getConfiguration('vectorMemory');
    const autoSyncEnabled = config.get<boolean>('autoSync.enabled', true);
    const autoSyncInterval = config.get<number>('autoSync.intervalMinutes', 5);

    // Stop existing auto-sync if running
    if (autoSyncDisposable) {
        autoSyncDisposable.dispose();
        autoSyncDisposable = null;
    }

    if (autoSyncEnabled) {
        console.log(`Setting up auto-sync with ${autoSyncInterval} minute interval`);

        // Start periodic auto-sync
        syncCommand.startAutoSync(autoSyncInterval).then(disposable => {
            autoSyncDisposable = disposable;
        }).catch(error => {
            console.error('Failed to start auto-sync:', error);
            vscode.window.showErrorMessage(`Failed to start auto-sync: ${error instanceof Error ? error.message : 'Unknown error'}`);
        });
    } else {
        console.log('Auto-sync disabled');
    }
}

function createContextWithConfig(configManager: ConfigManager): Context {
    const embeddingConfig = configManager.getEmbeddingProviderConfig();
    const milvusConfig = configManager.getMilvusFullConfig();
    const splitterConfig = configManager.getSplitterConfig();

    try {
        let embedding;
        let vectorDatabase;

        const contextConfig: any = {};

        // Create embedding instance
        if (embeddingConfig) {
            embedding = ConfigManager.createEmbeddingInstance(embeddingConfig.provider, embeddingConfig.config);
            console.log(`Embedding initialized with ${embeddingConfig.provider} (model: ${embeddingConfig.config.model})`);
            contextConfig.embedding = embedding;
        } else {
            console.log('No embedding configuration found');
        }

        // Create vector database instance
        if (milvusConfig) {
            vectorDatabase = new MilvusRestfulVectorDatabase(milvusConfig);
            console.log(`Vector database initialized with Milvus REST API (address: ${milvusConfig.address})`);
            contextConfig.vectorDatabase = vectorDatabase;
        } else {
            vectorDatabase = new MilvusRestfulVectorDatabase({
                address: envManager.get('MILVUS_ADDRESS') || 'http://localhost:19530',
                token: envManager.get('MILVUS_TOKEN') || ''
            });
            console.log('No Milvus configuration found, using default REST API configuration');
            contextConfig.vectorDatabase = vectorDatabase;
        }

        // Create splitter instance
        let codeSplitter;
        if (splitterConfig) {
            if (splitterConfig.type === SplitterType.LANGCHAIN) {
                codeSplitter = new LangChainCodeSplitter(
                    splitterConfig.chunkSize ?? 1000,
                    splitterConfig.chunkOverlap ?? 200
                );
            } else { // Default to AST splitter
                codeSplitter = new AstCodeSplitter(
                    splitterConfig.chunkSize ?? 2500,
                    splitterConfig.chunkOverlap ?? 300
                );
            }
            contextConfig.codeSplitter = codeSplitter;
            console.log(`Splitter configured: ${splitterConfig.type} (chunkSize: ${splitterConfig.chunkSize}, overlap: ${splitterConfig.chunkOverlap})`);
        } else {
            codeSplitter = new AstCodeSplitter(2500, 300);
            contextConfig.codeSplitter = codeSplitter;
            console.log('No splitter configuration found, using default AST splitter (chunkSize: 2500, overlap: 300)');
        }
        return new Context(contextConfig);
    } catch (error) {
        console.error('Failed to create Context with user config:', error);
        vscode.window.showErrorMessage(`Failed to initialize Context: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
    }
}

function reloadContextConfiguration() {
    console.log('Reloading Context configuration...');

    const embeddingConfig = configManager.getEmbeddingProviderConfig();
    const milvusConfig = configManager.getMilvusFullConfig();
    const splitterConfig = configManager.getSplitterConfig();

    try {
        // Update embedding if configuration exists
        if (embeddingConfig) {
            const embedding = ConfigManager.createEmbeddingInstance(embeddingConfig.provider, embeddingConfig.config);
            codeContext.updateEmbedding(embedding);
            console.log(`Embedding updated with ${embeddingConfig.provider} (model: ${embeddingConfig.config.model})`);
        }

        // Update vector database if configuration exists
        if (milvusConfig) {
            const vectorDatabase = new MilvusRestfulVectorDatabase(milvusConfig);
            codeContext.updateVectorDatabase(vectorDatabase);
            console.log(`Vector database updated with Milvus REST API (address: ${milvusConfig.address})`);
        }

        // Update splitter if configuration exists
        if (splitterConfig) {
            let newSplitter;
            if (splitterConfig.type === SplitterType.LANGCHAIN) {
                newSplitter = new LangChainCodeSplitter(
                    splitterConfig.chunkSize ?? 1000,
                    splitterConfig.chunkOverlap ?? 200
                );
            } else {
                newSplitter = new AstCodeSplitter(
                    splitterConfig.chunkSize ?? 2500,
                    splitterConfig.chunkOverlap ?? 300
                );
            }
            codeContext.updateSplitter(newSplitter);
            console.log(`Splitter updated: ${splitterConfig.type} (chunkSize: ${splitterConfig.chunkSize}, overlap: ${splitterConfig.chunkOverlap})`);
        } else {
            const defaultSplitter = new AstCodeSplitter(2500, 300);
            codeContext.updateSplitter(defaultSplitter);
            console.log('No splitter configuration found, using default AST splitter (chunkSize: 2500, overlap: 300)');
        }

        // Update command instances with new context
        searchCommand.updateContext(codeContext);
        indexCommand.updateContext(codeContext);
        syncCommand.updateContext(codeContext);

        // Restart auto-sync if it was enabled
        setupAutoSync();

        console.log('Context configuration reloaded successfully');
        vscode.window.showInformationMessage('Configuration reloaded successfully!');
    } catch (error) {
        console.error('Failed to reload Context configuration:', error);
        vscode.window.showErrorMessage(`Failed to reload configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Token monitoring helper functions
async function showContextManagementOptions(): Promise<void> {
    const options = [
        'Show Token Statistics',
        'Store Current Context',
        'Reset Token Counter',
        'Search Memory',
        'Validate MCP Connection'
    ];

    const selection = await vscode.window.showQuickPick(options, {
        placeHolder: 'Select a context management option'
    });

    switch (selection) {
        case 'Show Token Statistics':
            await tokenMonitor.showDetailedStats();
            break;
        case 'Store Current Context':
            await tokenMonitor.storeCurrentContext();
            break;
        case 'Reset Token Counter':
            await tokenMonitor.resetTokenCounter();
            break;
        case 'Search Memory':
            await searchConversationMemory();
            break;
        case 'Validate MCP Connection':
            await validateMCPConnection();
            break;
    }
}

async function searchConversationMemory(): Promise<void> {
    const query = await vscode.window.showInputBox({
        prompt: 'Search conversation memory',
        placeHolder: 'Enter search query (e.g., "authentication system", "React components")'
    });

    if (!query) {
        return;
    }

    try {
        const results = await mcpContextManager.searchConversationMemory(query);

        if (results.length === 0) {
            vscode.window.showInformationMessage('No matching conversations found.');
            return;
        }

        const formattedResults = `# Conversation Memory Search Results

**Query**: "${query}"
**Found**: ${results.length} matches

${results.map((result, index) => `
## Result ${index + 1}
**Relevance**: ${result.score || 'N/A'}
**Content**: ${result.content || result.summary || 'No content available'}
**Timestamp**: ${result.timestamp ? new Date(result.timestamp).toLocaleString() : 'Unknown'}
`).join('\n')}

*Use "Claude Context: Bootstrap Context" to restore relevant context*
`;

        const document = await vscode.workspace.openTextDocument({
            content: formattedResults,
            language: 'markdown'
        });

        await vscode.window.showTextDocument(document);

    } catch (error) {
        vscode.window.showErrorMessage(`Memory search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function validateMCPConnection(): Promise<void> {
    try {
        const isValid = await mcpContextManager.validateMCPConnection();

        if (isValid) {
            vscode.window.showInformationMessage('✅ MCP connection is working correctly!');
        } else {
            vscode.window.showWarningMessage('⚠️ MCP connection failed. Check configuration and server status.');
        }

    } catch (error) {
        vscode.window.showErrorMessage(`MCP validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Thread management helper functions
async function searchThreads(): Promise<void> {
    const query = await vscode.window.showInputBox({
        prompt: 'Search conversation threads',
        placeHolder: 'Enter search query (e.g., "backend", "VS Code extension")'
    });

    if (!query) {
        return;
    }

    try {
        const threads = await mcpContextManager.searchThreads(query);

        if (threads.length === 0) {
            vscode.window.showInformationMessage(`No threads found matching: "${query}"`);
            return;
        }

        const threadItems = threads.map(thread => ({
            label: thread.threadTitle,
            description: `${thread.sessionCount} sessions, last: ${thread.lastActivity.toLocaleDateString()}`,
            detail: thread.firstMessage,
            threadId: thread.threadId
        }));

        const selected = await vscode.window.showQuickPick(threadItems, {
            placeHolder: `Found ${threads.length} threads. Select one to restore:`
        });

        if (selected) {
            await mcpContextManager.restoreThreadContext(selected.threadId);
        }

    } catch (error) {
        vscode.window.showErrorMessage(`Thread search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function createNewThread(): Promise<void> {
    const threadTitle = await vscode.window.showInputBox({
        prompt: 'Create new conversation thread',
        placeHolder: 'Enter thread title (e.g., "Checking if backend is running locally")',
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
        return;
    }

    try {
        // Force creation of new thread by clearing current context
        const currentThread = mcpContextManager.getCurrentThread();

        // Reset current thread to force new thread creation
        await mcpContextManager.restoreThreadContext(''); // This will fail and prompt for new thread

        // Initialize new thread with empty snapshot for now
        await mcpContextManager.storeConversation({
            tokenCount: 0,
            sessionDuration: '0h 0m',
            activeFiles: [],
            gitStatus: 'Unknown',
            searchResults: [],
            messages: [],
            filesModified: [],
            workspaceContext: {}
        }, threadTitle.trim());

        vscode.window.showInformationMessage(`✅ New thread created: "${threadTitle}"`);

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create new thread: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function showCurrentThread(): Promise<void> {
    const currentThread = mcpContextManager.getCurrentThread();

    if (!currentThread.threadId) {
        const createNew = await vscode.window.showInformationMessage(
            'No active thread. Would you like to create one?',
            'Create Thread',
            'Browse Existing'
        );

        if (createNew === 'Create Thread') {
            await createNewThread();
        } else if (createNew === 'Browse Existing') {
            await mcpContextManager.showThreadBrowser();
        }
        return;
    }

    try {
        const sessions = await mcpContextManager.getSessionsForThread(currentThread.threadId);

        const threadInfo = `# Current Thread Context

## Thread Information
- **Title**: ${currentThread.threadTitle}
- **Thread ID**: ${currentThread.threadId}
- **Sessions**: ${sessions.length}
- **Created**: ${sessions.length > 0 ? sessions[sessions.length - 1].timestamp.toLocaleString() : 'Unknown'}
- **Last Activity**: ${sessions.length > 0 ? sessions[0].timestamp.toLocaleString() : 'Unknown'}

## Recent Sessions
${sessions.slice(0, 5).map((session, index) => `
### Session ${index + 1}
- **ID**: ${session.sessionId}
- **Time**: ${session.timestamp.toLocaleString()}
- **Tokens**: ${session.tokenCount.toLocaleString()}
- **Summary**: ${session.summary}
`).join('\n')}

${sessions.length > 5 ? `\n*... and ${sessions.length - 5} more sessions*` : ''}

## Actions
- Use "Claude Context: Browse Threads" to switch threads
- Use "Claude Context: Search Memory" to find specific content
- Current token monitoring will automatically store to this thread
`;

        const document = await vscode.workspace.openTextDocument({
            content: threadInfo,
            language: 'markdown'
        });

        await vscode.window.showTextDocument(document);

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to show thread info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export function deactivate() {
    console.log('Context extension is now deactivated');

    // Stop auto-sync if running
    if (autoSyncDisposable) {
        autoSyncDisposable.dispose();
        autoSyncDisposable = null;
    }

    // Clean up token monitoring
    tokenMonitor?.dispose();
    mcpContextManager?.dispose();
    chatInterceptor?.dispose();
}