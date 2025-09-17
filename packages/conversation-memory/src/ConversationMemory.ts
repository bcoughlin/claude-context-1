import { Context, SemanticSearchResult } from '@zilliz/claude-context-core';
import { ConversationSession, ConversationSearchResult, MemoryQueryOptions } from './types';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Revolutionary AI Conversation Memory System
 * 
 * Provides persistent memory for AI conversations using vector search technology.
 * Solves the fundamental limitation of AI assistance - inability to maintain long-term context.
 */
export class ConversationMemory {
  private context: Context;
  private conversationStorePath: string;

  constructor(context: Context, storePath: string = path.join(os.homedir(), '.conversation-memory')) {
    this.context = context;
    this.conversationStorePath = storePath;
    this.ensureStoreDirectoryExists();
  }

  private ensureStoreDirectoryExists(): void {
    if (!fs.existsSync(this.conversationStorePath)) {
      fs.mkdirSync(this.conversationStorePath, { recursive: true });
    }
  }

  /**
   * Store a conversation session with technical extraction and vector embeddings
   */
  async storeConversation(session: ConversationSession): Promise<boolean> {
    try {
      // Create enhanced content for vector search with technical metadata
      const enhancedContent = this.extractTechnicalContent(session);

      // Create a temporary file with conversation content for indexing
      const tempFilePath = path.join(this.conversationStorePath, `${session.id}.md`);
      fs.writeFileSync(tempFilePath, enhancedContent);

      // Also store the session metadata as JSON
      const metadataPath = path.join(this.conversationStorePath, `${session.id}.json`);
      fs.writeFileSync(metadataPath, JSON.stringify(session, null, 2));

      // Index the conversation directory using semantic search
      await this.context.indexCodebase(this.conversationStorePath);

      return true;
    } catch (error) {
      console.error('[ConversationMemory] Failed to store conversation:', error);
      return false;
    }
  }

  /**
   * Search conversation memory using semantic search
   */
  async searchMemory(
    query: string,
    options: MemoryQueryOptions = {}
  ): Promise<ConversationSearchResult[]> {
    try {
      const { limit = 10 } = options;

      // Perform semantic search on conversation memory
      const searchResults = await this.context.semanticSearch(
        this.conversationStorePath,
        query,
        limit,
        0.5
      );

      // Transform results to ConversationSearchResult format
      const results: ConversationSearchResult[] = [];

      for (const result of searchResults) {
        // Only process .md files (conversation content)
        if (!result.relativePath.endsWith('.md')) continue;

        const sessionId = path.basename(result.relativePath, '.md');
        const metadataPath = path.join(this.conversationStorePath, `${sessionId}.json`);

        if (fs.existsSync(metadataPath)) {
          const sessionData = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

          // Apply filters if specified
          if (this.matchesFilters(sessionData, options)) {
            results.push({
              session: sessionData,
              relevanceScore: result.score,
              matchedContent: [result.content],
              context: this.extractContext(result.content, query)
            });
          }
        }
      }

      return results.slice(0, limit);
    } catch (error) {
      console.error('[ConversationMemory] Failed to search memory:', error);
      return [];
    }
  }

  /**
   * List all conversation sessions with optional filtering
   */
  async listSessions(options: MemoryQueryOptions = {}): Promise<ConversationSession[]> {
    try {
      const sessions: ConversationSession[] = [];
      const files = fs.readdirSync(this.conversationStorePath);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.conversationStorePath, file);
          const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

          if (this.matchesFilters(sessionData, options)) {
            sessions.push(sessionData);
          }
        }
      }

      // Sort by timestamp (newest first)
      sessions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return sessions.slice(0, options.limit || 50);
    } catch (error) {
      console.error('[ConversationMemory] Failed to list sessions:', error);
      return [];
    }
  }

  /**
   * Bootstrap context by loading relevant conversation history
   */
  async bootstrapContext(
    contextQuery: string,
    options: MemoryQueryOptions = {}
  ): Promise<{
    relevantSessions: ConversationSearchResult[];
    contextSummary: string;
    suggestedActions: string[];
  }> {
    try {
      // Search for relevant conversations
      const relevantSessions = await this.searchMemory(contextQuery, { ...options, limit: 5 });

      // Generate context summary
      const contextSummary = this.generateContextSummary(relevantSessions);

      // Generate suggested actions based on past patterns
      const suggestedActions = this.generateSuggestedActions(relevantSessions);

      return {
        relevantSessions,
        contextSummary,
        suggestedActions
      };
    } catch (error) {
      console.error('[ConversationMemory] Failed to bootstrap context:', error);
      return {
        relevantSessions: [],
        contextSummary: 'Unable to load context from conversation memory.',
        suggestedActions: []
      };
    }
  }

  // Private helper methods

  private extractTechnicalContent(session: ConversationSession): string {
    const sections = [
      `# Conversation: ${session.title}`,
      `**Date:** ${session.timestamp}`,
      `**Project:** ${session.project || 'General'}`,
      `**Technologies:** ${session.technologies.join(', ')}`,
      `**Participants:** ${session.participants.join(', ')}`,
      '',
      `## Summary`,
      session.summary,
      ''
    ];

    if (session.technicalDecisions.length > 0) {
      sections.push('## Technical Decisions');
      session.technicalDecisions.forEach(decision => {
        sections.push(`### ${decision.decision}`);
        sections.push(`**Reasoning:** ${decision.reasoning}`);
        sections.push(`**Impact:** ${decision.impact}`);
        sections.push(`**Files:** ${decision.files.join(', ')}`);
        sections.push('');
      });
    }

    if (session.codeChanges.length > 0) {
      sections.push('## Code Changes');
      session.codeChanges.forEach(change => {
        sections.push(`### ${change.type.toUpperCase()}: ${change.description}`);
        sections.push(`**Purpose:** ${change.purpose}`);
        sections.push(`**Files:** ${change.files.join(', ')}`);
        sections.push('');
      });
    }

    if (session.architecture.length > 0) {
      sections.push('## Architecture Notes');
      session.architecture.forEach(note => {
        sections.push(`### ${note.component} - ${note.pattern}`);
        sections.push(`**Description:** ${note.description}`);
        sections.push(`**Rationale:** ${note.rationale}`);
        sections.push('');
      });
    }

    return sections.join('\n');
  }

  private matchesFilters(session: ConversationSession, options: MemoryQueryOptions): boolean {
    if (options.project && session.project !== options.project) {
      return false;
    }

    if (options.technologies && options.technologies.length > 0) {
      const hasMatchingTech = options.technologies.some(tech =>
        session.technologies.some(sessionTech =>
          sessionTech.toLowerCase().includes(tech.toLowerCase())
        )
      );
      if (!hasMatchingTech) return false;
    }

    if (options.timeRange) {
      const sessionTime = new Date(session.timestamp);
      if (sessionTime < options.timeRange.start || sessionTime > options.timeRange.end) {
        return false;
      }
    }

    return true;
  }

  private extractContext(content: string, query: string): string {
    // Simple context extraction - get surrounding text around query matches
    const lines = content.split('\n');
    const queryWords = query.toLowerCase().split(' ');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      if (queryWords.some(word => line.includes(word))) {
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length, i + 3);
        return lines.slice(start, end).join('\n');
      }
    }

    return content.substring(0, 200) + '...';
  }

  private generateContextSummary(sessions: ConversationSearchResult[]): string {
    if (sessions.length === 0) {
      return 'No relevant conversation history found.';
    }

    const projects = new Set(sessions.map(s => s.session.project).filter(Boolean));
    const technologies = new Set(sessions.flatMap(s => s.session.technologies));
    const recentSessions = sessions.slice(0, 3);

    let summary = `Found ${sessions.length} relevant conversation(s) `;
    if (projects.size > 0) {
      summary += `across ${Array.from(projects).join(', ')} project(s) `;
    }
    if (technologies.size > 0) {
      summary += `involving ${Array.from(technologies).join(', ')} technologies. `;
    }

    summary += '\n\nMost relevant sessions:\n';
    recentSessions.forEach((result, index) => {
      summary += `${index + 1}. ${result.session.title} (${result.session.timestamp})\n`;
      summary += `   ${result.session.summary}\n`;
    });

    return summary;
  }

  private generateSuggestedActions(sessions: ConversationSearchResult[]): string[] {
    const actions: string[] = [];

    if (sessions.length === 0) {
      return ['Consider starting a new technical session to build conversation memory.'];
    }

    // Analyze patterns in past sessions
    const hasCodeChanges = sessions.some(s => s.session.codeChanges.length > 0);
    const hasTechnicalDecisions = sessions.some(s => s.session.technicalDecisions.length > 0);
    const hasArchitectureNotes = sessions.some(s => s.session.architecture.length > 0);

    if (hasCodeChanges) {
      actions.push('Review previous code changes for patterns and potential optimizations');
    }

    if (hasTechnicalDecisions) {
      actions.push('Consider how past technical decisions impact current work');
    }

    if (hasArchitectureNotes) {
      actions.push('Reference previous architecture patterns for consistency');
    }

    // Common patterns
    const technologies = sessions.flatMap(s => s.session.technologies);
    const mostUsedTech = this.getMostFrequent(technologies);
    if (mostUsedTech) {
      actions.push(`Consider leveraging previous ${mostUsedTech} experience`);
    }

    return actions.slice(0, 5); // Limit to 5 suggestions
  }

  private getMostFrequent(arr: string[]): string | null {
    if (arr.length === 0) return null;

    const frequency: { [key: string]: number } = {};
    arr.forEach(item => {
      frequency[item] = (frequency[item] || 0) + 1;
    });

    return Object.keys(frequency).reduce((a, b) =>
      frequency[a] > frequency[b] ? a : b
    );
  }
}
