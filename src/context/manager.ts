import { getSessionHistory, addMessageToSession, getSession } from '../sessions/manager.js';
import { ModelManager } from '../models/manager.js';
import { getDb } from '../sessions/db.js';

export interface ContextStatus {
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  remainingTokens: number;
  warning?: string;
}

/**
 * Tracks active token count of the conversation session and emits warnings if thresholds are breached.
 */
export async function checkContextBudget(conversationId: string, modelManager: ModelManager): Promise<ContextStatus> {
  const history = getSessionHistory(conversationId);
  const maxTokens = modelManager.getContextLength();

  // Count tokens currently in conversation
  const mappedHistory = history.map(m => ({
    role: (m.role === 'assistant' || m.role === 'system' ? m.role : 'user') as 'user' | 'assistant' | 'system',
    content: m.content
  }));
  const totalTokens = await modelManager.countTokens(mappedHistory);
  const percentage = Number(((totalTokens / maxTokens) * 100).toFixed(1));
  const remainingTokens = Math.max(0, maxTokens - totalTokens);

  let warning: string | undefined;
  if (percentage >= 95) {
    warning = `CRITICAL WARNING: Context usage is at ${percentage}%. Summarization recommended.`;
  } else if (percentage >= 90) {
    warning = `WARNING: Context usage is at ${percentage}%.`;
  } else if (percentage >= 80) {
    warning = `Notice: Context usage is at ${percentage}%.`;
  }

  return {
    totalTokens,
    maxTokens,
    percentage,
    remainingTokens,
    warning,
  };
}

/**
 * Condenses old messages into a single summary block, replacing them in the database to reclaim context.
 */
export async function summarizeOldMessages(conversationId: string, modelManager: ModelManager): Promise<void> {
  const history = getSessionHistory(conversationId);
  if (history.length <= 4) return; // Not enough messages to summarize

  // Take first 60% of history messages
  const summaryCount = Math.floor(history.length * 0.6);
  const toSummarize = history.slice(0, summaryCount);
  const toKeep = history.slice(summaryCount);

  const promptText = toSummarize.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

  try {
    const summaryResult = await modelManager.generate([
      {
        role: 'system',
        content: 'You are a summarization bot. Concisely summarize the core points, findings, decisions, and instructions of the following chat logs in less than 3 paragraphs. Keep all technical outputs, directories, and critical notes verbatim.',
      },
      {
        role: 'user',
        content: promptText,
      },
    ]);

    const db = getDb();
    // Delete the summarized messages
    const deleteStmt = db.prepare('DELETE FROM messages WHERE id = ?');
    for (const msg of toSummarize) {
      deleteStmt.run(msg.id);
    }

    // Inject the summary as a system reminder at the start of the remaining history
    addMessageToSession(
      conversationId,
      'system',
      `[CONVERSATION SUMMARY OF OLDER MESSAGES]\n${summaryResult.content}`,
      summaryResult.tokensIn,
      summaryResult.tokensOut,
      summaryResult.cost
    );
  } catch (error) {
    console.error('Failed to generate automatic context summarization:', error);
  }
}
