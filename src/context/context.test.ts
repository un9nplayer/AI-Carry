import test from 'node:test';
import assert from 'node:assert';
import { addMemory, listMemories, searchMemories, pinMemory, deleteMemory } from '../memory/store.js';
import { checkContextBudget } from './manager.js';
import { ModelManager } from '../models/manager.js';
import { createSession } from '../sessions/manager.js';
import { initConfig } from '../config/index.js';
import { closeDb } from '../sessions/db.js';

test('Memory and Context Manager test suite', async (t) => {
  initConfig();

  await t.test('CRUD memory store actions', () => {
    const listBefore = listMemories();

    const mem = addMemory('pinned', 'AICarry workspace configurations', 1, '/project/root');
    assert.strictEqual(mem.type, 'pinned');
    assert.strictEqual(mem.content, 'AICarry workspace configurations');
    assert.strictEqual(mem.pinned, 1);

    const listAfter = listMemories();
    assert.strictEqual(listAfter.length, listBefore.length + 1);

    // Search
    const search = searchMemories('workspace');
    assert.ok(search.length > 0);
    assert.strictEqual(search[0].content, 'AICarry workspace configurations');

    // Pin change
    pinMemory(mem.id, false);
    const updatedList = listMemories();
    const updatedMem = updatedList.find((m) => m.id === mem.id);
    assert.strictEqual(updatedMem?.pinned, 0);

    // Delete
    deleteMemory(mem.id);
    const listEnd = listMemories();
    assert.strictEqual(listEnd.length, listBefore.length);
  });

  await t.test('checkContextBudget outputs accurate ratings', async () => {
    const modelManager = new ModelManager();
    const session = createSession('Budget Conv', 'gpt-4o-mini');

    const budget = await checkContextBudget(session.id, modelManager);
    assert.strictEqual(budget.totalTokens, 0); // No messages yet
    assert.strictEqual(budget.percentage, 0.0);
    assert.strictEqual(budget.warning, undefined);
  });

  t.after(() => {
    closeDb();
  });
});
