import test from 'node:test';
import assert from 'node:assert';
import { ModelManager } from './manager.js';
import { initConfig } from '../config/index.js';

test('Model Manager test suite', async (t) => {
  initConfig();

  await t.test('detectProvider maps model name to correct adapter', () => {
    const manager = new ModelManager();
    
    manager.setModel('gemini-2.5-pro');
    assert.strictEqual(manager.getActiveProvider(), 'gemini');
    assert.strictEqual(manager.supportsVision(), true);

    manager.setModel('gpt-4o-mini');
    assert.strictEqual(manager.getActiveProvider(), 'openai');
    assert.strictEqual(manager.supportsVision(), false);

    manager.setModel('claude-3-5-sonnet');
    assert.strictEqual(manager.getActiveProvider(), 'anthropic');
    assert.strictEqual(manager.supportsImages(), true);

    manager.setModel('ollama/llama3');
    assert.strictEqual(manager.getActiveProvider(), 'ollama');

    manager.setModel('openrouter/google/gemini-2.5');
    assert.strictEqual(manager.getActiveProvider(), 'openrouter');

    manager.setModel('nvidia/llama-3.1');
    assert.strictEqual(manager.getActiveProvider(), 'nvidia');
  });

  await t.test('token counter counts message words', async () => {
    const manager = new ModelManager();
    manager.setModel('gpt-4o-mini');
    const count = await manager.countTokens([{ role: 'user', content: 'hello world' }]);
    assert.ok(count > 0);
  });
});
