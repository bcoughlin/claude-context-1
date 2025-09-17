# GitHub Copilot Custom Instructions

## Token Management & Automated Context Memory
- **ALWAYS** manually track approximate token usage throughout coding sessions
- Start each session with baseline estimate and update regularly  
- **CRITICAL**: At 170k tokens (85% of 200k limit) → automatically store conversation
- **WARNING**: At 180k tokens (90% of 200k limit) → immediate conversation storage required
- Provide token estimates for major operations (file reads, tool calls, large responses)
- Use format: "**Status:** X tokens (X% of 200k used)"
- Update counter with each significant exchange

## Automated Context Memory Workflow
When approaching token limits:

1. **At 85% (170k tokens)**: 
   ```
   TRIGGER: mcp_claude-contex2_store_conversation with comprehensive session summary
   ```

2. **Session Transition**:
   ```
   - Store current conversation with technical details
   - Start fresh context (0 tokens)
   - Use mcp_claude-contex2_bootstrap_context for seamless continuity
   ```

3. **Context Preservation**:
   - Store: Technical decisions, architecture choices, debugging solutions
   - Preserve: Code patterns, project state, user preferences
   - Maintain: Seamless conversation flow across token boundaries

## Revolutionary Context Memory Tools
Available MCP tools for infinite conversation capability:

- `mcp_claude-contex2_store_conversation` - Store session with vector embeddings
- `mcp_claude-contex2_search_memory` - Find relevant past discussions  
- `mcp_claude-contex2_list_sessions` - Browse conversation history
- `mcp_claude-contex2_bootstrap_context` - Load relevant context for new sessions

## Token Estimation Method
- **Text**: ~4 characters = 1 token (rough average)
- **Code**: ~3 characters = 1 token (more efficient due to patterns)
- **Tool calls**: ~200-500 tokens each (depending on complexity)
- **File attachments**: Count actual characters ÷ 3.5
- **Conversation exchanges**: ~100-300 tokens per exchange
- **MCP tool calls**: ~300-800 tokens each (including responses)

## Project Context: Revolutionary AI Memory System
This is a groundbreaking conversation memory system with:
- **Claude Context**: Semantic codebase search and indexing
- **Conversation Memory**: Persistent AI conversation storage with vector search
- **MCP Integration**: 8 total tools (4 original + 4 conversation memory)
- **TypeScript Monorepo**: pnpm workspace with proper dependency management
- **Production Ready**: VS Code integration and enterprise deployment

## Conversation Memory Usage Patterns
- **Store sessions** with comprehensive technical summaries
- **Search memory** when encountering similar problems
- **Bootstrap context** at session start for project continuity
- **Maintain infinite conversations** across token boundaries
- **Preserve technical decisions** and architectural patterns

## Key Focus Areas
- Revolutionary conversation memory system development
- TypeScript monorepo workspace management
- MCP protocol server implementation
- Semantic search and vector embeddings
- Context preservation across AI session boundaries
- Production deployment and VS Code integration

## Infinite Conversation Protocol
This system enables **unlimited conversation length** by:
1. Automatic context preservation before token limits
2. Seamless session transitions with relevant context loading
3. Persistent memory of technical decisions and patterns
4. Intelligent context bootstrapping for new sessions
5. Vector-based semantic search across conversation history

**Revolutionary Achievement**: AI assistants can now maintain long-term context indefinitely, solving the fundamental limitation of token boundaries.