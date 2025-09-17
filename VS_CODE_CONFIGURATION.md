# VS Code & AI Coding Assistant Configuration for Claude Context with Conversation Memory

This guide shows how to configure the enhanced Claude Context MCP server (with conversation memory) to work with VS Code and various AI coding assistants.

## 🧠 Enhanced Features

Our forked version includes **revolutionary conversation memory capabilities**:
- **Store conversation sessions** for persistent AI knowledge
- **Semantic search** through conversation history
- **Context bootstrapping** for new sessions
- **Session management** across projects
- All original Claude Context features (code indexing, semantic search)

## Quick Start

### Prerequisites

1. **Node.js** >= 20.0.0 and < 24.0.0
2. **API Keys**:
   - OpenAI API key for embeddings
   - Zilliz Cloud API key for vector storage (sign up at [Zilliz Cloud](https://cloud.zilliz.com/signup))

### Environment Variables

Create a `.env` file in your project or set these globally:

```bash
# Required for embeddings
OPENAI_API_KEY=sk-your-openai-api-key

# Required for vector database
MILVUS_TOKEN=your-zilliz-cloud-api-key
MILVUS_ADDRESS=your-zilliz-cloud-public-endpoint

# Optional: Embedding provider (default: OpenAI)
EMBEDDING_PROVIDER=OpenAI
EMBEDDING_MODEL=text-embedding-3-small
```

## Configuration for Different AI Assistants

### 1. Claude Code (Recommended)

Use the command line interface to add our enhanced MCP server:

```bash
claude mcp add claude-context-conversation-memory \
  -e OPENAI_API_KEY=sk-your-openai-api-key \
  -e MILVUS_TOKEN=your-zilliz-cloud-api-key \
  -- npx @zilliz/claude-context-mcp@latest
```

### 2. Claude Desktop

Edit your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "claude-context-conversation-memory": {
      "command": "npx",
      "args": ["@zilliz/claude-context-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "sk-your-openai-api-key",
        "MILVUS_TOKEN": "your-zilliz-cloud-api-key",
        "MILVUS_ADDRESS": "your-zilliz-cloud-public-endpoint"
      }
    }
  }
}
```

### 3. VS Code with MCP Extension

If you have an MCP extension for VS Code, add this configuration:

```json
{
  "mcp.servers": {
    "claude-context-conversation-memory": {
      "command": "npx",
      "args": ["@zilliz/claude-context-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "sk-your-openai-api-key",
        "MILVUS_TOKEN": "your-zilliz-cloud-api-key"
      }
    }
  }
}
```

### 4. Cursor

Add to your Cursor MCP configuration (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "claude-context-conversation-memory": {
      "command": "npx",
      "args": ["-y", "@zilliz/claude-context-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "sk-your-openai-api-key",
        "MILVUS_ADDRESS": "your-zilliz-cloud-public-endpoint",
        "MILVUS_TOKEN": "your-zilliz-cloud-api-key"
      }
    }
  }
}
```

### 5. Local Development

For local development and testing:

```bash
# Clone our enhanced repository
git clone https://github.com/your-username/claude-context-fork.git
cd claude-context-fork

# Install dependencies
npm install

# Build the enhanced MCP package
cd packages/mcp
npm run build

# Run locally
node dist/index.js
```

## Available MCP Tools

### Original Claude Context Tools
- `index_codebase` - Index a codebase for semantic search
- `search_code` - Search through indexed code
- `clear_index` - Clear codebase index
- `get_indexing_status` - Check indexing progress

### 🧠 New Conversation Memory Tools
- `store_conversation` - Store conversation sessions with technical extraction
- `search_memory` - Semantic search through conversation history  
- `list_sessions` - Browse sessions by project/technology/time
- `bootstrap_context` - Auto-load relevant context for new sessions

## Usage Examples

### Basic Code Search
```
> Search for authentication logic in the codebase
[AI uses index_codebase and search_code tools to find relevant authentication code]
```

### 🚀 Revolutionary Memory Features
```
> Store this conversation about email verification system
[AI uses store_conversation to save technical decisions and implementation details]

> What did we implement for user authentication before?
[AI uses search_memory to find previous authentication discussions]

> Bootstrap context for React authentication work
[AI uses bootstrap_context to load relevant previous conversations]
```

## Development Workflow

### 1. Initial Project Setup
```bash
# Index your codebase
> Please index this codebase for semantic search

# The AI will use index_codebase tool automatically
```

### 2. During Development
```bash
# Search for patterns
> Find all error handling patterns in the API routes

# Store important conversations
> Store our discussion about the JWT implementation approach

# The AI automatically stores technical decisions and code changes
```

### 3. Starting New Sessions
```bash
# Bootstrap with relevant context
> I'm working on email verification, load relevant context

# The AI uses bootstrap_context to find related conversations
```

## Configuration Tips

### Performance Optimization
```bash
# Use faster embedding models for development
EMBEDDING_MODEL=text-embedding-3-small

# Use local Milvus for development
MILVUS_ADDRESS=localhost:19530
```

### Security Best Practices
```bash
# Store API keys securely
echo "OPENAI_API_KEY=sk-your-key" >> ~/.env
echo "MILVUS_TOKEN=your-token" >> ~/.env

# Reference environment variables in MCP configs
"env": {
  "OPENAI_API_KEY": "${OPENAI_API_KEY}",
  "MILVUS_TOKEN": "${MILVUS_TOKEN}"
}
```

## Troubleshooting

### Common Issues

**Node.js Version Incompatibility**
```bash
# Check Node.js version
node --version

# Should be >= 20.0.0 and < 24.0.0
# If not, downgrade using nvm:
nvm install 22.17.0
nvm use 22.17.0
```

**MCP Server Not Starting**
```bash
# Test the server directly
npx @zilliz/claude-context-mcp@latest

# Check environment variables
echo $OPENAI_API_KEY
echo $MILVUS_TOKEN
```

**Vector Database Connection Issues**
```bash
# Verify Zilliz Cloud credentials
# Check endpoint format: https://in01-your-cluster.aws-us-west-2.vectordb.zillizcloud.com:19543
```

### Debug Mode

Enable detailed logging:
```bash
export DEBUG=claude-context:*
npx @zilliz/claude-context-mcp@latest
```

## Revolutionary Impact

This enhanced version transforms AI coding assistance by providing:

1. **Persistent Memory**: AI remembers previous conversations and technical decisions
2. **Cross-Session Context**: Knowledge accumulates across development sessions
3. **Smart Context Loading**: Relevant context loaded automatically for new work
4. **Pattern Recognition**: Find similar problems solved before

### Before vs After

**Before**: "Can you remind me how we implemented JWT authentication?"
**After**: AI automatically searches conversation history and provides complete context with previous implementation details, architectural decisions, and code examples.

## Support

For issues specific to the conversation memory features, please open an issue in our fork repository. For general Claude Context issues, refer to the [main project documentation](https://github.com/zilliztech/claude-context).

---

**Status**: Revolutionary AI conversation memory system ready for production use with VS Code and AI coding assistants.