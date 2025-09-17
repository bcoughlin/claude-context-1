export interface ConversationSession {
  id: string
  timestamp: Date
  title: string
  project?: string
  technologies: string[]
  summary: string
  technicalDecisions: TechnicalDecision[]
  codeChanges: CodeChange[]
  architecture: ArchitectureNote[]
  participants: string[]
  duration?: number
  tokenCount?: number
}

export interface TechnicalDecision {
  decision: string
  reasoning: string
  alternatives: string[]
  impact: string
  files: string[]
}

export interface CodeChange {
  type: 'created' | 'modified' | 'deleted' | 'refactored'
  files: string[]
  description: string
  purpose: string
}

export interface ArchitectureNote {
  component: string
  pattern: string
  description: string
  rationale: string
}

export interface ConversationSearchResult {
  session: ConversationSession
  relevanceScore: number
  matchedContent: string[]
  context: string
}

export interface MemoryQueryOptions {
  project?: string
  technologies?: string[]
  timeRange?: {
    start: Date
    end: Date
  }
  limit?: number
  minRelevance?: number
}
