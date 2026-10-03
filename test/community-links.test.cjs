const assert = require('node:assert/strict');
const test = require('node:test');
const { registerCommunityLinks } = require('../apps/desktop/electron/community-links.cjs');

function setup(openExternal) {
  const handlers = new Map();
  registerCommunityLinks({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    shell: { openExternal },
  });
  return handlers;
}

test('Discord opens the current invitation, ignoring renderer-supplied URLs', async () => {
  const calls = [];
  const handlers = setup(async (url) => calls.push(url));
  await handlers.get('community:open-discord')({}, 'file:///tmp/untrusted');
  assert.deepEqual(calls, ['https://discord.gg/PcKC8AbaaA']);
});

test('GitHub opens the Beam repository', async () => {
  const calls = [];
  const handlers = setup(async (url) => calls.push(url));
  await handlers.get('community:open-github')();
  assert.deepEqual(calls, ['https://github.com/BeamRecorder/Beam']);
});

test('external-link failures propagate to the caller', async () => {
  const handlers = setup(async () => {
    throw new Error('Browser unavailable');
  });
  for (const channel of ['community:open-discord', 'community:open-github']) {
    await assert.rejects(handlers.get(channel)(), /Browser unavailable/);
  }
});
