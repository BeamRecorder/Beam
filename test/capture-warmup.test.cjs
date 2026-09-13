const assert = require('node:assert/strict');
const test = require('node:test');
const { prewarmCaptureCapabilities } = require('../electron/lifecycle/capture-warmup.cjs');

test('warms Linux capabilities without selecting a source or starting capture', async () => {
  const commands = [];
  await prewarmCaptureCapabilities({ request: async (command) => commands.push(command) }, { platform: 'linux' });
  assert.deepEqual(commands, ['capabilities']);
});

test('does not probe screen permissions on Windows or macOS during startup', async () => {
  for (const platform of ['win32', 'darwin']) {
    await prewarmCaptureCapabilities({ request: () => assert.fail('unexpected capture probe') }, { platform });
  }
});

test('a missing or failed engine does not prevent HUD startup or subsequent retry', async () => {
  for (const request of [
    () => {
      throw new Error('binary missing');
    },
    async () => {
      throw new Error('engine exited');
    },
  ]) {
    const logs = [];
    await prewarmCaptureCapabilities({ request }, { platform: 'linux', log: (message) => logs.push(message) });
    assert.match(logs[0], /Capture warmup failed/);
  }
  const commands = [];
  await prewarmCaptureCapabilities({ request: async (command) => commands.push(command) }, { platform: 'linux' });
  assert.deepEqual(commands, ['capabilities']);
});
