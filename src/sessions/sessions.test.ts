import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initConfig } from '../config/index.js';
import {
  createSession,
  getSession,
  listSessions,
  renameSession,
  deleteSession,
  addMessageToSession,
  getSessionHistory,
  exportSessionMarkdown,
  exportSessionJSON
} from './manager.js';
import { closeDb } from './db.js';

test('Database and Session Manager test suite', async (t) => {
  // Ensure config initializes which initializes the config directory path
  initConfig();

  await t.test('CRUD sessions and messages', () => {
    // Clean list first
    const sessionsBefore = listSessions();

    const session = createSession('Test Conv', 'gemini-2.5-pro', 'You are a helper');
    assert.ok(session.id);
    assert.strictEqual(session.title, 'Test Conv');
    assert.strictEqual(session.model, 'gemini-2.5-pro');

    const retrieved = getSession(session.id);
    assert.ok(retrieved);
    assert.strictEqual(retrieved?.title, 'Test Conv');

    const sessionsAfter = listSessions();
    assert.strictEqual(sessionsAfter.length, sessionsBefore.length + 1);

    // Add messages
    addMessageToSession(session.id, 'user', 'Hello AI!');
    addMessageToSession(session.id, 'assistant', 'Hello human!');

    const history = getSessionHistory(session.id);
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].role, 'user');
    assert.strictEqual(history[0].content, 'Hello AI!');
    assert.strictEqual(history[1].role, 'assistant');
    assert.strictEqual(history[1].content, 'Hello human!');

    // Rename
    renameSession(session.id, 'New Name');
    const updated = getSession(session.id);
    assert.strictEqual(updated?.title, 'New Name');

    // Export test
    const mdPath = path.join(os.tmpdir(), `aicarry_test_${session.id}.md`);
    const jsonPath = path.join(os.tmpdir(), `aicarry_test_${session.id}.json`);

    exportSessionMarkdown(session.id, mdPath);
    assert.ok(fs.existsSync(mdPath));
    const mdText = fs.readFileSync(mdPath, 'utf8');
    assert.ok(mdText.includes('New Name'));
    assert.ok(mdText.includes('Hello AI!'));
    fs.unlinkSync(mdPath);

    exportSessionJSON(session.id, jsonPath);
    assert.ok(fs.existsSync(jsonPath));
    const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    assert.strictEqual(jsonContent.session.title, 'New Name');
    assert.strictEqual(jsonContent.messages.length, 2);
    fs.unlinkSync(jsonPath);

    // Delete
    deleteSession(session.id);
    const deleted = getSession(session.id);
    assert.strictEqual(deleted, null);
  });

  t.after(() => {
    closeDb();
  });
});
