const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { registerCaptureIpc } = require('../apps/desktop/electron/capture/capture-ipc.cjs');

const cursor = { mode: 'separate', captureClicks: true, captureShortcuts: true };

function recordingIpc({ ensureReady = async () => {}, platform = 'linux' } = {}) {
  const handlers = new Map();
  const calls = [];
  registerCaptureIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), on: () => {} },
    app: new EventEmitter(),
    desktopCapturer: {},
    screen: {},
    BrowserWindow: { getAllWindows: () => [] },
    userPaths: { studioProjects: '/tmp/beam-input-preparation' },
    trackStorages: [],
    platform,
    inputAccess: {
      ensureReady: async (requestedCursor) => {
        calls.push('input-access');
        assert.deepEqual(requestedCursor, { ...requestedCursor, ...cursor });
        await ensureReady();
      },
    },
    captureEngine: {
      canCleanup: () => true,
      request: async (command) => {
        calls.push(command);
        if (command === 'discover')
          return {
            sources: [],
            capabilities: { separateCursor: true, cursorClicks: true, inputShortcuts: true },
          };
        return { state: command === 'start' ? 'recording' : 'armed', sessionId: 'session-input' };
      },
    },
  });
  return { request: handlers.get('capture:request'), calls };
}

for (const command of ['prepare-default-recording', 'start-default-recording']) {
  test(`${command} automatically enables Linux interactions before native preparation`, async () => {
    const { request, calls } = recordingIpc();
    const session = await request({}, command, { options: { screenId: 'portal:monitor', recordInteractions: true } });
    assert.equal(session.sessionId, 'session-input');
    assert.deepEqual(calls, ['discover', 'input-access', 'prepare', ...(command.startsWith('start') ? ['start'] : [])]);
  });
}

for (const command of ['prepare', 'start-recording']) {
  test(`${command} also verifies Linux interaction access for an explicit capture configuration`, async () => {
    const { request, calls } = recordingIpc();
    await request({}, command, { config: { cursor } });
    assert.deepEqual(calls, ['input-access', 'prepare', ...(command.startsWith('start') ? ['start'] : [])]);
  });
}

test('native recording preparation waits until the shared authorization completes', async () => {
  let resolve;
  const gate = new Promise((done) => {
    resolve = done;
  });
  const { request, calls } = recordingIpc({ ensureReady: () => gate });
  const preparation = request({}, 'prepare-default-recording', {
    options: { screenId: 'portal:monitor', recordInteractions: true },
  });
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(calls, ['discover', 'input-access']);
  resolve();
  await preparation;
  assert.deepEqual(calls, ['discover', 'input-access', 'prepare']);
});

test('cancelled Linux authorization cancels default preparation and allows a later retry', async () => {
  let attempts = 0;
  const { request, calls } = recordingIpc({
    ensureReady: async () => {
      if (++attempts === 1) throw Object.assign(new Error('Authorization cancelled'), { code: 'cancelled' });
    },
  });
  const options = { screenId: 'portal:monitor', recordInteractions: true };
  assert.equal(await request({}, 'prepare-default-recording', { options }), null);
  assert.deepEqual(calls, ['discover', 'input-access']);
  assert.equal((await request({}, 'prepare-default-recording', { options })).sessionId, 'session-input');
  assert.deepEqual(calls, ['discover', 'input-access', 'discover', 'input-access', 'prepare']);
});

test('failed Linux interaction access prevents capture and preserves the diagnostic', async () => {
  const { request, calls } = recordingIpc({
    ensureReady: async () => {
      throw Object.assign(new Error('No mouse devices are accessible'), { code: 'input-devices-unavailable' });
    },
  });
  await assert.rejects(
    request({}, 'start-default-recording', { options: { screenId: 'portal:monitor', recordInteractions: true } }),
    {
      code: 'input-devices-unavailable',
      message: 'capture-engine a échoué pour "prepare": No mouse devices are accessible',
    },
  );
  assert.deepEqual(calls, ['discover', 'input-access']);
});

for (const requestedCursor of [
  { mode: 'separate', captureClicks: false, captureShortcuts: false },
  { mode: 'embedded', captureClicks: true, captureShortcuts: true },
  { mode: 'disabled' },
]) {
  test(`does not activate Linux input for ${JSON.stringify(requestedCursor)}`, async () => {
    const { request, calls } = recordingIpc({ ensureReady: () => assert.fail('authorization not requested') });
    await request({}, 'prepare', { config: { cursor: requestedCursor } });
    assert.deepEqual(calls, ['prepare']);
  });
}

test('does not launch the Linux helper for a macOS recording', async () => {
  const { request, calls } = recordingIpc({
    platform: 'darwin',
    ensureReady: () => assert.fail('Linux helper requested on macOS'),
  });
  await request({}, 'prepare', { config: { cursor } });
  assert.deepEqual(calls, ['prepare']);
});
