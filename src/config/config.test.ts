import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { initConfig, getConfig, updateConfig, getConfigPath } from './index.js';
import { encrypt, decrypt } from './keys.js';

test('Config Module test suite', async (t) => {
  // Ensure we start with clean config file for testing by deleting it if exists
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }

  await t.test('initConfig sets up and retrieves defaults', () => {
    const config = initConfig();
    assert.strictEqual(config.defaultModel, 'gemini-2.5-pro');
    assert.strictEqual(config.streaming, true);
    assert.strictEqual(config.theme, 'dark');
  });

  await t.test('updateConfig alters config and writes to filesystem', () => {
    updateConfig({ defaultModel: 'gpt-4o', theme: 'cyberpunk' });
    const config = getConfig();
    assert.strictEqual(config.defaultModel, 'gpt-4o');
    assert.strictEqual(config.theme, 'cyberpunk');

    // Read file directly to verify it was written
    const fileContent = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
    assert.strictEqual(fileContent.defaultModel, 'gpt-4o');
    assert.strictEqual(fileContent.theme, 'cyberpunk');
  });

  await t.test('encrypt and decrypt key values', () => {
    const plainKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyz';
    const encryptedKey = encrypt(plainKey);
    assert.notStrictEqual(encryptedKey, plainKey);
    const decryptedKey = decrypt(encryptedKey);
    assert.strictEqual(decryptedKey, plainKey);
  });
});
