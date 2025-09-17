export { ConversationMemory } from './ConversationMemory'
export * from './types'

// Convenience function to create a conversation session from summary text
export function createSessionFromSummary(
  summaryText: string,
  project?: string
): ConversationSession {
  return {
    id: `session_${Date.now()}`,
    timestamp: new Date(),
    title: extractTitle(summaryText) || 'AI Conversation Session',
    project,
    technologies: extractTechnologies(summaryText),
    summary: summaryText,
    technicalDecisions: [],
    codeChanges: [],
    architecture: [],
    participants: ['AI Assistant', 'User']
  }
}

function extractTitle(text: string): string | null {
  // Extract title from conversation summary
  const titlePatterns = [
    /(?:Session|Conversation).*?:\s*([^.\n]+)/i,
    /(?:Primary|Main) (?:Objective|Goal).*?:\s*([^.\n]+)/i,
    /^([^.\n]{10,60})/m // First meaningful line
  ]

  for (const pattern of titlePatterns) {
    const match = text.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }

  return null
}

function extractTechnologies(text: string): string[] {
  const techPatterns = [
    /(?:using|with|implemented|built)\s+([A-Z][a-zA-Z0-9\.]+)/g,
    /(?:React|Vue|Angular|TypeScript|JavaScript|Python|FastAPI|Express|Node\.js|Docker|AWS|PostgreSQL|MongoDB|Redis)/gi
  ]

  const technologies = new Set<string>()
  
  techPatterns.forEach(pattern => {
    const matches = text.matchAll(pattern)
    for (const match of matches) {
      technologies.add(match[1] || match[0])
    }
  })

  return Array.from(technologies)
}
