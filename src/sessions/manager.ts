import crypto from 'node:crypto';
import fs from 'node:fs';
import { getDb } from './db.js';

export interface Conversation {
  id: string;
  title: string;
  model: string;
  system_prompt: string | null;
  created_at: number;
  updated_at: number;
  metadata: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tokens_in: number;
  tokens_out: number;
  cost: number;
  created_at: number;
}

export function createSession(title: string, model: string, systemPrompt?: string): Conversation {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  const query = db.prepare(`
    INSERT INTO conversations (id, title, model, system_prompt, created_at, updated_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  query.run(id, title, model, systemPrompt || null, now, now, '{}');
  return {
    id,
    title,
    model,
    system_prompt: systemPrompt || null,
    created_at: now,
    updated_at: now,
    metadata: '{}',
  };
}

export function getSession(id: string): Conversation | null {
  const db = getDb();
  const query = db.prepare('SELECT * FROM conversations WHERE id = ?');
  const result = query.get(id);
  return (result as Conversation) || null;
}

export function listSessions(): Conversation[] {
  const db = getDb();
  const query = db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC');
  return query.all() as Conversation[];
}

export function renameSession(id: string, title: string): void {
  const db = getDb();
  const query = db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?');
  query.run(title, Date.now(), id);
}

export function updateSessionModel(id: string, model: string): void {
  const db = getDb();
  const query = db.prepare('UPDATE conversations SET model = ?, updated_at = ? WHERE id = ?');
  query.run(model, Date.now(), id);
}

export function deleteSession(id: string): void {
  const db = getDb();
  // Cascade delete is supported by FOREIGN KEY constraint, but let's delete explicitly if needed
  const deleteMsgs = db.prepare('DELETE FROM messages WHERE conversation_id = ?');
  deleteMsgs.run(id);
  const deleteConv = db.prepare('DELETE FROM conversations WHERE id = ?');
  deleteConv.run(id);
}

export function addMessageToSession(
  conversationId: string,
  role: string,
  content: string,
  tokensIn = 0,
  tokensOut = 0,
  cost = 0.0
): Message {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();

  const insertMsg = db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, tokens_in, tokens_out, cost, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertMsg.run(id, conversationId, role, content, tokensIn, tokensOut, cost, now);

  const updateConvTime = db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?');
  updateConvTime.run(now, conversationId);

  return {
    id,
    conversation_id: conversationId,
    role,
    content,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost,
    created_at: now,
  };
}

export function getSessionHistory(conversationId: string): Message[] {
  const db = getDb();
  const query = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC');
  return query.all(conversationId) as Message[];
}

export function exportSessionMarkdown(conversationId: string, outputPath: string): void {
  const session = getSession(conversationId);
  if (!session) {
    throw new Error(`Session with ID ${conversationId} not found`);
  }

  const history = getSessionHistory(conversationId);
  let md = `# Conversation: ${session.title}\n`;
  md += `Model: ${session.model}\n`;
  md += `Created: ${new Date(session.created_at).toISOString()}\n\n`;

  if (session.system_prompt) {
    md += `## System Prompt\n\`\`\`\n${session.system_prompt}\n\`\`\`\n\n`;
  }

  for (const msg of history) {
    md += `### ${msg.role.toUpperCase()}\n${msg.content}\n\n`;
  }

  fs.writeFileSync(outputPath, md, 'utf8');
}

export function exportSessionJSON(conversationId: string, outputPath: string): void {
  const session = getSession(conversationId);
  if (!session) {
    throw new Error(`Session with ID ${conversationId} not found`);
  }

  const history = getSessionHistory(conversationId);
  const data = {
    session,
    messages: history,
  };

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
}
