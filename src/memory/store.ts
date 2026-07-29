import crypto from 'node:crypto';
import { getDb } from '../sessions/db.js';

export interface Memory {
  id: string;
  type: string; // pinned | short_term | long_term | workspace
  content: string;
  pinned: number; // 0 or 1
  workspace: string | null;
  created_at: number;
}

export function addMemory(type: string, content: string, pinned = 0, workspace?: string): Memory {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();

  const insert = db.prepare(`
    INSERT INTO memories (id, type, content, pinned, workspace, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insert.run(id, type, content, pinned, workspace || null, now);

  return {
    id,
    type,
    content,
    pinned,
    workspace: workspace || null,
    created_at: now,
  };
}

export function searchMemories(queryStr: string): Memory[] {
  const db = getDb();
  const search = db.prepare('SELECT * FROM memories WHERE content LIKE ? ORDER BY created_at DESC');
  return search.all(`%${queryStr}%`) as Memory[];
}

export function listMemories(type?: string): Memory[] {
  const db = getDb();
  if (type) {
    const list = db.prepare('SELECT * FROM memories WHERE type = ? ORDER BY created_at DESC');
    return list.all(type) as Memory[];
  }
  const list = db.prepare('SELECT * FROM memories ORDER BY created_at DESC');
  return list.all() as Memory[];
}

export function pinMemory(id: string, pinned: boolean): void {
  const db = getDb();
  const update = db.prepare('UPDATE memories SET pinned = ? WHERE id = ?');
  update.run(pinned ? 1 : 0, id);
}

export function deleteMemory(id: string): void {
  const db = getDb();
  const del = db.prepare('DELETE FROM memories WHERE id = ?');
  del.run(id);
}
