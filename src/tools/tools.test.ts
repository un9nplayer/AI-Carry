import test from 'node:test';
import assert from 'node:assert';
import { parseToolCalls, executeToolCalls } from './executor.js';
import { initConfig, updateConfig } from '../config/index.js';

test('Tool Registry and Executor test suite', async (t) => {
  initConfig();

  await t.test('parseToolCalls extracts XML structures', () => {
    const text = 'Let me run a command: <terminal>echo "Hello"</terminal> and read <cat>test.txt</cat>';
    const calls = parseToolCalls(text);

    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].tool, 'terminal');
    assert.strictEqual(calls[0].args.command, 'echo "Hello"');
    assert.strictEqual(calls[1].tool, 'cat');
    assert.strictEqual(calls[1].args.path, 'test.txt');
  });

  await t.test('permissions validate and restrict tools', async () => {
    // Set to readonly mode
    updateConfig({ toolPermissions: 'readonly' });

    const text = 'Run: <terminal>echo "should block"</terminal>';
    const calls = parseToolCalls(text);
    const output = await executeToolCalls(calls);

    assert.ok(output.includes('Permission Denied'));
  });

  await t.test('permissions allow readonly tool in readonly mode', async () => {
    updateConfig({ toolPermissions: 'readonly' });

    // File that doesn't exist to test cat error inside readonly limit
    const text = 'Read: <cat>missing_file_xyz.txt</cat>';
    const calls = parseToolCalls(text);
    const output = await executeToolCalls(calls);

    assert.ok(output.includes('missing_file_xyz.txt'));
  });
});
