#!/usr/bin/env node

// CRITICAL: Redirect console outputs to stderr IMMEDIATELY to avoid interfering with MCP JSON protocol
// Only MCP protocol messages should go to stdout
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

console.log = (...args: any[]) => {
    process.stderr.write('[LOG] ' + args.join(' ') + '\n');
};

console.warn = (...args: any[]) => {
    process.stderr.write('[WARN] ' + args.join(' ') + '\n');
};

// console.error already goes to stderr by default

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    ListToolsRequestSchema,
    CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { Context } from "@zilliz/claude-context-core";
import { MilvusVectorDatabase } from "@zilliz/claude-context-core";

// Import our modular components
import { createMcpConfig, logConfigurationSummary, showHelpMessage, ContextMcpConfig } from "./config.js";
import { createEmbeddingInstance, logEmbeddingProviderInfo } from "./embedding.js";
import { SnapshotManager } from "./snapshot.js";
import { ToolHandlers } from "./handlers.js";

class ContextMcpServer {
    private server: Server;
    private snapshotManager: SnapshotManager;
    private toolHandlers: ToolHandlers;

    constructor(config: ContextMcpConfig) {
        // Initialize MCP server
        this.server = new Server(
            {
                name: config.name,
                version: config.version
            },
            {
                capabilities: {
                    tools: {}
                }
            }
        );

        // Initialize embedding provider
        console.log(`[EMBEDDING] Initializing embedding provider: ${config.embeddingProvider}`);
        console.log(`[EMBEDDING] Using model: ${config.embeddingModel}`);

        const embedding = createEmbeddingInstance(config);
        logEmbeddingProviderInfo(config, embedding);

        // Initialize vector database (for conversation memory only)
        const vectorDatabase = new MilvusVectorDatabase({
            address: config.milvusAddress,
            ...(config.milvusToken && { token: config.milvusToken })
        });

        // Initialize managers (memory-focused only)
        this.snapshotManager = new SnapshotManager();

        // Create a minimal Context for memory operations only
        const memoryContext = new Context({
            embedding,
            vectorDatabase
        });

        this.toolHandlers = new ToolHandlers(memoryContext, this.snapshotManager);

        // Load existing conversation sessions on startup
        this.snapshotManager.loadCodebaseSnapshot();

        this.setupTools();
    }

    private setupTools() {
        // Define available tools (memory-focused with code search capabilities)
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "bootstrap_context",
                        description: "Bootstrap context for a new session by searching relevant conversation history",
                        inputSchema: {
                            type: "object",
                            properties: {
                                query: {
                                    type: "string",
                                    description: "Query describing what context to bootstrap (e.g., 'email verification system', 'React authentication')"
                                },
                                project: {
                                    type: "string",
                                    description: "Optional: Project name to focus the context search"
                                }
                            },
                            required: ["query"]
                        }
                    },
                    {
                        name: "list_sessions",
                        description: "List stored conversation sessions",
                        inputSchema: {
                            type: "object",
                            properties: {
                                limit: {
                                    type: "number",
                                    description: "Maximum number of sessions to return",
                                    default: 10,
                                    maximum: 50
                                },
                                project: {
                                    type: "string",
                                    description: "Optional: Filter by project name"
                                }
                            },
                            required: []
                        }
                    },
                    {
                        name: "search_memory",
                        description: "Search conversation memory for relevant past discussions",
                        inputSchema: {
                            type: "object",
                            properties: {
                                query: {
                                    type: "string",
                                    description: "Search query to find relevant conversations"
                                },
                                limit: {
                                    type: "number",
                                    description: "Maximum number of results to return",
                                    default: 5,
                                    maximum: 20
                                },
                                minRelevance: {
                                    type: "number",
                                    description: "Minimum relevance score (0.0-1.0)",
                                    default: 0.3,
                                    minimum: 0,
                                    maximum: 1
                                },
                                project: {
                                    type: "string",
                                    description: "Optional: Filter by project name"
                                }
                            },
                            required: ["query"]
                        }
                    },
                    {
                        name: "store_conversation",
                        description: "Store a conversation session in memory for future retrieval",
                        inputSchema: {
                            type: "object",
                            properties: {
                                conversationData: {
                                    description: "Either a conversation summary string or a complete ConversationSession object with id, title, summary, etc.",
                                    type: ["string", "object"]
                                },
                                project: {
                                    type: "string",
                                    description: "Optional: Project name to associate with this conversation"
                                }
                            },
                            required: ["conversationData"]
                        }
                    },
                    {
                        name: "retrieve_memory",
                        description: "Retrieve a specific conversation session by ID",
                        inputSchema: {
                            type: "object",
                            properties: {
                                sessionId: {
                                    type: "string",
                                    description: "The ID of the conversation session to retrieve"
                                }
                            },
                            required: ["sessionId"]
                        }
                    },
                    {
                        name: "update_memory",
                        description: "Update an existing conversation session",
                        inputSchema: {
                            type: "object",
                            properties: {
                                sessionId: {
                                    type: "string",
                                    description: "The ID of the conversation session to update"
                                },
                                updates: {
                                    type: "object",
                                    description: "Object containing fields to update (title, summary, technologies, etc.)"
                                }
                            },
                            required: ["sessionId", "updates"]
                        }
                    },
                    {
                        name: "delete_memory",
                        description: "Delete a conversation session from memory",
                        inputSchema: {
                            type: "object",
                            properties: {
                                sessionId: {
                                    type: "string",
                                    description: "The ID of the conversation session to delete"
                                }
                            },
                            required: ["sessionId"]
                        }
                    },
                    {
                        name: "index_codebase",
                        description: "Index a codebase for semantic code search",
                        inputSchema: {
                            type: "object",
                            properties: {
                                codebasePath: {
                                    type: "string",
                                    description: "Path to the codebase directory to index"
                                },
                                forceReindex: {
                                    type: "boolean",
                                    description: "Whether to recreate the index even if it exists",
                                    default: false
                                },
                                description: {
                                    type: "string",
                                    description: "Optional description for the codebase"
                                },
                                threadId: {
                                    type: "string",
                                    description: "Optional thread ID for thread-specific indexing"
                                }
                            },
                            required: ["codebasePath"]
                        }
                    },
                    {
                        name: "search_code",
                        description: "Search indexed code for relevant snippets",
                        inputSchema: {
                            type: "object",
                            properties: {
                                query: {
                                    type: "string",
                                    description: "Search query to find relevant code"
                                },
                                limit: {
                                    type: "number",
                                    description: "Maximum number of results to return",
                                    default: 5,
                                    maximum: 20
                                },
                                minRelevance: {
                                    type: "number",
                                    description: "Minimum relevance score (0.0-1.0)",
                                    default: 0.3,
                                    minimum: 0,
                                    maximum: 1
                                },
                                codebasePath: {
                                    type: "string",
                                    description: "Optional: Path to the codebase to search (defaults to current workspace)"
                                },
                                threadId: {
                                    type: "string",
                                    description: "Optional: Thread ID for thread-specific search"
                                }
                            },
                            required: ["query"]
                        }
                    }
                ]
            };
        });

        // Handle tool execution (memory and code search tools)
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            switch (name) {
                case "bootstrap_context":
                    if (!args || typeof args !== 'object' || !('query' in args)) {
                        throw new Error('bootstrap_context requires query argument');
                    }
                    return await this.toolHandlers.bootstrapContext(args.query as string, (args as any).project);

                case "list_sessions":
                    return await this.toolHandlers.listSessions(args as any);

                case "search_memory":
                    if (!args || typeof args !== 'object' || !('query' in args)) {
                        throw new Error('search_memory requires query argument');
                    }
                    return await this.toolHandlers.searchMemory(args.query as string, args as any);

                case "store_conversation":
                    if (!args || typeof args !== 'object' || !('conversationData' in args)) {
                        throw new Error('store_conversation requires conversationData argument');
                    }
                    return await this.toolHandlers.storeConversation(args.conversationData as any);

                case "retrieve_memory":
                    if (!args || typeof args !== 'object' || !('sessionId' in args)) {
                        throw new Error('retrieve_memory requires sessionId argument');
                    }
                    return await this.toolHandlers.retrieveMemory(args.sessionId as string);

                case "update_memory":
                    if (!args || typeof args !== 'object' || !('sessionId' in args) || !('updates' in args)) {
                        throw new Error('update_memory requires sessionId and updates arguments');
                    }
                    return await this.toolHandlers.updateMemory(args.sessionId as string, args.updates as any);

                case "delete_memory":
                    if (!args || typeof args !== 'object' || !('sessionId' in args)) {
                        throw new Error('delete_memory requires sessionId argument');
                    }
                    return await this.toolHandlers.deleteMemory(args.sessionId as string);

                case "index_codebase":
                    if (!args || typeof args !== 'object' || !('codebasePath' in args)) {
                        throw new Error('index_codebase requires codebasePath argument');
                    }
                    return await this.toolHandlers.indexCodebase(args.codebasePath as string, args as any);

                case "search_code":
                    if (!args || typeof args !== 'object' || !('query' in args)) {
                        throw new Error('search_code requires query argument');
                    }
                    return await this.toolHandlers.searchCode(args.query as string, args as any);

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        });
    }

    async start() {
        console.log('Starting Context MCP Memory server...');

        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log("MCP Memory server started and listening on stdio.");

        // Memory server focuses on conversation management only
        // Code indexing and sync handled by original claude-context server
    }
}

// Main execution
async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2);

    // Show help if requested
    if (args.includes('--help') || args.includes('-h')) {
        showHelpMessage();
        process.exit(0);
    }

    // Create configuration
    const config = createMcpConfig();
    logConfigurationSummary(config);

    const server = new ContextMcpServer(config);
    await server.start();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.error("Received SIGINT, shutting down gracefully...");
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.error("Received SIGTERM, shutting down gracefully...");
    process.exit(0);
});

// Always start the server - this is designed to be the main entry point
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});