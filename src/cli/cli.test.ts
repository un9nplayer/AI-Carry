import test from 'node:test';
import assert from 'node:assert';
import { executeSlashCommand } from './commands.js';
import { getAutocompleteSuggestions } from './autocomplete.js';
import { ModelManager } from '../models/manager.js';
import { initConfig } from '../config/index.js';
import { closeDb } from '../sessions/db.js';

test('CLI Slash Commands and Autocomplete test suite', async (t) => {
  initConfig();

  await t.test('autocomplete matches command prefix', () => {
    const list = getAutocompleteSuggestions('/mo');
    assert.ok(list.includes('/model'));
    assert.ok(list.includes('/models'));
  });

  await t.test('autocomplete model values', () => {
    const list = getAutocompleteSuggestions('/model ge');
    assert.ok(list.includes('/model gemini-2.5-pro'));
    assert.ok(list.includes('/model gemini-2.5-flash'));
  });

  await t.test('execute slash command mode changes', async () => {
    const manager = new ModelManager();
    let currentMode: 'plan' | 'build' = 'plan';
    const setMode = (mode: 'plan' | 'build') => {
      currentMode = mode;
    };

    const res = await executeSlashCommand('/build', manager, null, setMode);
    assert.strictEqual(res.handled, true);
    assert.strictEqual(currentMode, 'build');
    assert.strictEqual(res.action, 'mode-change');
    assert.strictEqual(res.payload, 'build');
  });

  t.after(() => {
    closeDb();
  });
});
