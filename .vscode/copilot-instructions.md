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

## Comprehensive Context Storage Standards

### CRITICAL: All-Encompassing Storage Requirements
When storing conversations, include EVERYTHING since last storage:

#### Complete Dialogue Flow
- **Every user prompt** and question asked
- **Full assistant responses** with reasoning chains
- **Back-and-forth evolution** of ideas and concepts
- **Collaborative insights** and breakthrough moments

#### Research Provenance (MANDATORY)
- **Search tools used**: `github_repo`, `semantic_search`, `read_file`, `fetch_webpage`, etc.
- **Exact queries executed**: What was searched for and why
- **Sources examined**: URLs, file paths, repository names, specific line numbers
- **Search results**: Actual content returned from searches
- **Evidence chains**: How search results led to conclusions
- **Source analysis**: What insights were derived from which sources

#### Technical Context
- **Files created/modified**: Complete list with purposes
- **Code changes**: What was implemented and why
- **Architecture decisions**: Technical choices made and rationale
- **Problem-solving process**: How issues were identified and resolved

#### Reasoning Transparency
- **Thought processes**: Step-by-step reasoning between responses
- **Strategy evolution**: How approaches changed through conversation
- **Knowledge synthesis**: How multiple sources combined into insights
- **Collaborative discoveries**: Moments where user and assistant built ideas together

### Storage Format Template
```
# Comprehensive Session: [Title]

## Complete Timeline Since Last Storage
- **Previous Storage**: Session ID and timestamp
- **Session Duration**: X hours/minutes of conversation
- **Context**: What prompted this session

## User-Assistant Exchange Sequence
[Every prompt and response with timestamps]

## Research Process Documentation
### Searches Conducted:
- Tool: [github_repo/semantic_search/etc.]
- Query: "exact search terms"
- Source: [URL/file path/repository]
- Results: [key findings]
- Impact: [how this influenced conclusions]

## Technical Implementation
[Files created, code changes, decisions made]

## Collaborative Insights
[Breakthrough moments, joint discoveries]

## Session Significance
[Why this conversation matters for future reference]
```

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