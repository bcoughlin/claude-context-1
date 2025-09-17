import { Context } from '@zilliz/claude-context-core'
import {
  ConversationSession,
  ConversationSearchResult,
  MemoryQueryOptions,
  TechnicalDecision,
  CodeChange,
  ArchitectureNote
} from './types'

/**
 * ConversationMemory - Persistent memory system for AI conversations
 * 
 * Stores, indexes, and retrieves conversation summaries to provide
 * cross-session context and eliminate "forgotten" knowledge.
 */
export class ConversationMemory {
  private context: Context
  private memoryPath: string

  constructor(context: Context, memoryPath: string = './conversation-memory') {
    this.context = context
    this.memoryPath = memoryPath
  }

  /**
   * Store a conversation session in vector memory
   */
  async storeConversation(session: ConversationSession): Promise<void> {
    // Create searchable content from conversation
    const searchableContent = this.createSearchableContent(session)
    
    // Store in vector database with metadata
    await this.context.indexContent(this.memoryPath, {
      id: session.id,
      content: searchableContent,
      metadata: {
        timestamp: session.timestamp.toISOString(),
        title: session.title,
        project: session.project,
        technologies: session.technologies,
        type: 'conversation-session'
      }
    })
  }

  /**
   * Search conversation memory for relevant context
   */
  async searchMemory(
    query: string, 
    options: MemoryQueryOptions = {}
  ): Promise<ConversationSearchResult[]> {
    const searchResults = await this.context.semanticSearch(
      this.memoryPath,
      query,
      options.limit || 5
    )

    return searchResults
      .filter(result => (result.score || 0) >= (options.minRelevance || 0.3))
      .map(result => ({
        session: this.deserializeSession(result.metadata),
        relevanceScore: result.score || 0,
        matchedContent: [result.content],
        context: result.content.substring(0, 500) + '...'
      }))
  }

  /**
   * Get conversation sessions by project or time range
   */
  async listSessions(options: MemoryQueryOptions = {}): Promise<ConversationSession[]> {
    // Implementation would filter by project, technologies, time range
    // For now, return basic search
    const results = await this.searchMemory('*', options)
    return results.map(r => r.session)
  }

  /**
   * Extract technical insights from conversation summary
   */
  extractTechnicalDecisions(conversationText: string): TechnicalDecision[] {
    // AI-powered extraction of technical decisions
    // This would use LLM to parse conversation summaries
    const decisions: TechnicalDecision[] = []
    
    // Pattern matching for common decision phrases
    const decisionPatterns = [
      /(?:decided to|chose to|implemented|switched to|adopted)\s+([^.]+)/gi,
      /(?:fixed|resolved|solved)\s+([^.]+)/gi,
      /(?:architecture|pattern|approach):\s+([^.]+)/gi
    ]

    decisionPatterns.forEach(pattern => {
      const matches = conversationText.matchAll(pattern)
      for (const match of matches) {
        decisions.push({
          decision: match[1].trim(),
          reasoning: 'Extracted from conversation',
          alternatives: [],
          impact: 'To be analyzed',
          files: []
        })
      }
    })

    return decisions
  }

  /**
   * Bootstrap context for new session
   */
  async bootstrapContext(query: string, project?: string): Promise<string> {
    const relevantSessions = await this.searchMemory(query, {
      project,
      limit: 3,
      minRelevance: 0.4
    })

    if (relevantSessions.length === 0) {
      return 'No relevant conversation history found.'
    }

    let context = 'Relevant conversation history:\n\n'
    relevantSessions.forEach((result, idx) => {
      context += `## Session ${idx + 1}: ${result.session.title}\n`
      context += `Date: ${result.session.timestamp.toLocaleDateString()}\n`
      context += `Technologies: ${result.session.technologies.join(', ')}\n`
      context += `Context: ${result.context}\n\n`
    })

    return context
  }

  private createSearchableContent(session: ConversationSession): string {
    let content = `${session.title}\n\n${session.summary}\n\n`
    
    content += `Technologies: ${session.technologies.join(', ')}\n\n`
    
    if (session.technicalDecisions.length > 0) {
      content += 'Technical Decisions:\n'
      session.technicalDecisions.forEach(decision => {
        content += `- ${decision.decision}: ${decision.reasoning}\n`
      })
      content += '\n'
    }

    if (session.codeChanges.length > 0) {
      content += 'Code Changes:\n'
      session.codeChanges.forEach(change => {
        content += `- ${change.type}: ${change.description} (${change.files.join(', ')})\n`
      })
      content += '\n'
    }

    return content
  }

  private deserializeSession(metadata: any): ConversationSession {
    return {
      id: metadata.id || '',
      timestamp: new Date(metadata.timestamp || Date.now()),
      title: metadata.title || 'Untitled Session',
      project: metadata.project,
      technologies: metadata.technologies || [],
      summary: metadata.summary || '',
      technicalDecisions: [],
      codeChanges: [],
      architecture: [],
      participants: ['AI Assistant', 'User']
    }
  }
}
