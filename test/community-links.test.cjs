const assert = require('node:assert/strict');
const test = require('node:test');
const { registerCommunityLinks } = require('../apps/desktop/electron/community-links.cjs');

function setup(openExternal, fetchImpl) {
  const handlers = new Map();
  registerCommunityLinks({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    shell: { openExternal },
    fetchImpl,
  });
  return handlers;
}

test('Discord opens the current invitation, ignoring renderer-supplied URLs', async () => {
  const calls = [];
  const handlers = setup(async (url) => calls.push(url));
  await handlers.get('community:open-discord')({}, 'file:///tmp/untrusted');
  assert.deepEqual(calls, ['https://discord.gg/PcKC8AbaaA']);
});

test('star count uses the fixed GitHub API with a bounded request', async () => {
  const requests = [];
  const handlers = setup(
    async () => {},
    async (...args) => {
      requests.push(args);
      return { ok: true, json: async () => ({ stargazers_count: 123 }) };
    },
  );
  assert.deepEqual(await handlers.get('community:get-github-stars')({}, 'https://untrusted'), { stars: 123 });
  assert.equal(requests[0][0], 'https://api.github.com/repos/BeamRecorder/Beam');
  assert.ok(requests[0][1].signal instanceof AbortSignal);
});

test('star count safely handles failed requests and malformed responses', async () => {
  for (const fetchImpl of [
    async () => {
      throw new Error('Network unavailable');
    },
    async () => ({
      ok: false,
      json: async () => {
        throw new Error('must not parse');
      },
    }),
    async () => ({
      ok: true,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    }),
  ]) {
    const handlers = setup(async () => {}, fetchImpl);
    assert.deepEqual(await handlers.get('community:get-github-stars')(), { stars: 0 });
  }
});

test('star count only accepts nonnegative safe integers', async () => {
  for (const value of [
    null,
    {},
    { stargazers_count: '12' },
    { stargazers_count: -1 },
    { stargazers_count: 1.5 },
    { stargazers_count: Infinity },
  ]) {
    const handlers = setup(
      async () => {},
      async () => ({ ok: true, json: async () => value }),
    );
    assert.deepEqual(await handlers.get('community:get-github-stars')(), { stars: 0 });
  }
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
