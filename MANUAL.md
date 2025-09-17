# Claude Memory - User Manual

## Overview

Claude Memory is an enhanced VS Code extension that provides thread-aware code indexing and search capabilities. Each conversation thread gets its own isolated collection in Zilliz, enabling context-specific code search and indexing.

## Prerequisites

- **VS Code** (latest version)
- **Node.js** 18+ 
- **pnpm** (package manager for monorepo workspaces)
- **Zilliz Cloud Account** (or local Milvus instance)
- **Original claude-context MCP server** (for core code operations)
- **claude-context-memory MCP server** (for conversation management)

## Installation

> **Note**: This project uses pnpm workspaces. Install pnpm with: `npm install -g pnpm`

### 1. Build the Extension

```bash
cd /path/to/claude-context-fork

# Install dependencies for the entire monorepo
pnpm install

# Build the core package first
cd packages/core
pnpm run build

# Build the extension
cd ../vscode-extension
pnpm run webpack:dev
```

> **Note**: Webpack warnings about `bufferutil` and `utf-8-validate` are normal and can be ignored.

### 2. Install Extension in VS Code

#### Method A: Load as Development Extension
1. Open VS Code
2. Press `F5` or go to **Run > Start Debugging**
3. Select "VS Code Extension Development Host"
4. New VS Code window opens with extension loaded

#### Method B: Package and Install
```bash
# Setup pnpm for global packages (one-time setup)
pnpm setup
source ~/.zshrc

# Install vsce globally
pnpm add -g @vscode/vsce

# Package the extension
cd packages/vscode-extension
pnpm run package

# Install the .vsix file
code --install-extension claude-memory-*.vsix
```

**Alternative**: If you prefer not to install vsce globally:
```bash
# Use npx to run vsce without global installation
cd packages/vscode-extension
npx @vscode/vsce package

# Install the .vsix file
code --install-extension claude-memory-*.vsix
```

### 3. Configure MCP Servers

Ensure you have the following MCP servers configured in your Claude Desktop or MCP client:

#### Original claude-context (Code Operations)
```json
{
  "name": "claude-context",
  "command": "npx",
  "args": ["-y", "@zilliz/claude-context"],
  "env": {
    "ZILLIZ_ENDPOINT": "your-endpoint",
    "ZILLIZ_TOKEN": "your-token"
  }
}
```

#### claude-context-memory (Conversation Management)
```json
{
  "name": "claude-context-memory", 
  "command": "node",
  "args": ["/path/to/claude-context-fork/packages/mcp/dist/index.js"],
  "env": {
    "ZILLIZ_ENDPOINT": "your-endpoint",
    "ZILLIZ_TOKEN": "your-token"
  }
}
```

## Usage

### Thread-Aware Indexing

1. **Open Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. **Run Command**: `Claude Memory: Index Current Thread`
3. **Select Folder**: Choose the codebase directory to index
4. **Confirm**: Click "Yes" to start indexing

**What Happens:**
- Creates thread-specific collection: `copilot_thread_chunks_xxxxxxxx`
- Collection description: `"Thread: {your-thread-title}"`
- Isolated from other threads' indexes

### Semantic Search

1. **Open Command Palette**
2. **Run Command**: `Claude Memory: Semantic Search`  
3. **Enter Query**: Natural language search query
4. **Browse Results**: Click on results to open files

**Search Scope:**
- Searches only current thread's collection
- Results isolated per conversation thread
- No cross-thread contamination

### Thread Management

#### Creating New Thread Context
- Each new conversation thread automatically gets isolated indexing
- Thread ID determines collection name
- Thread title appears in collection description

#### Switching Between Threads
- Extension automatically detects current thread
- Indexing and search operations use active thread context
- Collections remain persistent per thread

## Features

### ✅ Thread Isolation
- **Separate Collections**: Each thread = unique Zilliz collection
- **Independent Indexing**: Thread A and B can index same codebase separately  
- **Isolated Search**: Search results only from current thread's context

### ✅ Meaningful Collection Names
- **Format**: `copilot_thread_chunks_xxxxxxxx` (where x = MD5 hash of thread ID)
- **Description**: `"Thread: {actual-thread-title}"`
- **Easy Identification**: Clear naming in Zilliz dashboard

### ✅ VS Code Integration
- **Command Palette**: Native VS Code commands
- **Progress Notifications**: Real-time indexing progress
- **File Navigation**: Click search results to open files
- **Status Updates**: Clear success/error messages

## Troubleshooting

### Extension Not Appearing
1. **Check Installation**: Verify extension is installed in VS Code
2. **Reload Window**: `Cmd+R` / `Ctrl+R` to reload VS Code
3. **Check Developer Console**: `Help > Toggle Developer Tools`

### Commands Not in Palette
1. **Verify Build**: Ensure `pnpm run webpack:dev` completed successfully
2. **Check Dependencies**: Run `pnpm install` from project root if needed
3. **Check package.json**: Verify command contributions are defined
4. **Restart VS Code**: Close and reopen VS Code

### pnpm Global Installation Issues
1. **Setup Required**: Run `pnpm setup` and `source ~/.zshrc` if you get "ERR_PNPM_NO_GLOBAL_BIN_DIR"
2. **Alternative**: Use `npx @vscode/vsce package` instead of global installation
3. **Permission Issues**: Check that `$PNPM_HOME` is in your PATH

### Thread Context Not Working
1. **MCP Server**: Ensure claude-context-memory server is running
2. **Thread Detection**: Check console logs for thread context info
3. **Context Manager**: Verify MCPContextManager is initialized

### Collection Not Created
1. **Zilliz Connection**: Verify ZILLIZ_ENDPOINT and ZILLIZ_TOKEN
2. **Permissions**: Ensure account has collection creation permissions
3. **Collection Limit**: Check if you've hit Zilliz collection limits

### Search Returns No Results
1. **Index First**: Run "Index Current Thread" before searching
2. **Collection Exists**: Verify collection was created in Zilliz dashboard
3. **Thread Match**: Ensure searching in same thread that was indexed

## Advanced Usage

### Multiple Codebases per Thread
- Index multiple folders in same thread
- All indexed content appears in thread's collection
- Search across all indexed content in thread

### Cross-Thread Workflows
- Switch threads to access different indexed contexts
- Each thread maintains independent search index
- No cross-contamination between thread contexts

### Collection Management
- Collections persist between VS Code sessions
- Manual cleanup available through Zilliz dashboard
- Thread collections automatically reused when re-indexing

## Configuration

### Extension Settings
```json
{
  "claudeMemory.maxResults": 50,
  "claudeMemory.threshold": 0.3
}
```

### Environment Variables
```bash
# Required for MCP servers
export ZILLIZ_ENDPOINT="https://your-cluster.zillizcloud.com"
export ZILLIZ_TOKEN="your-api-token"

# Optional
export ZILLIZ_DATABASE="default"
```

## Support

### Logs and Debugging
- **VS Code Console**: `Help > Toggle Developer Tools > Console`
- **MCP Server Logs**: Check terminal where MCP server is running
- **Extension Logs**: Look for `[LOG]` and `[WARN]` messages

### Common Issues
- **Permission Errors**: Check Zilliz token permissions
- **Network Issues**: Verify endpoint URL and connectivity
- **Memory Limits**: Monitor Zilliz cluster resource usage

### Getting Help
1. Check logs for specific error messages
2. Verify all prerequisites are met
3. Test with simple codebase first
4. Report issues with log excerpts and reproduction steps