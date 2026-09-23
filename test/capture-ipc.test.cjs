const assert = require('node:assert/strict');
const test = require('node:test');
const { registerCaptureIpc, displayBoundsForId } = require('../electron/capture/capture-ipc.cjs');
function harness(overrides = {}) {
  const handlers = new Map();
  const calls = [];
  const engine = {
    request: async (command, payload) => {
      calls.push({ command, payload });
      if (command === 'sources')
        return {
          screens: { Ok: [{ id: 'portal:monitor', kind: 'display', selectionMode: 'portal' }] },
          cameras: { Ok: [] },
          microphones: { Ok: [] },
          systemOutputs: { Ok: [] },
        };
      if (command === 'prepare') return { state: 'armed', sessionId: 'session-1' };
      return { state: command === 'stop' ? 'completed' : 'recording', sessionId: 'session-1' };
    },
  };
  registerCaptureIpc({
    ipcMain: { handle: (key, handler) => handlers.set(key, handler) },
    captureEngine: engine,
    userPaths: { instantProjects: '/projects/instant' },
    platform: 'linux',
    screen: { getAllDisplays: () => [] },
    ...overrides,
  });
  const request = (command, payload = {}, sender = 1) =>
    handlers.get('media:request')({ sender: { id: sender } }, command, payload);
  return { calls, engine, request, handlers };
}
test('one native prepare selects all four tracks and constrains output to host roots', async () => {
  const h = harness();
  await h.request('prepare', {
    options: {
      screenId: 'portal:monitor',
      cameraId: 'camera-1',
      microphoneId: 'mic-1',
      systemAudio: true,
      outputRoot: '/outside',
    },
  });
  const config = h.calls.find((c) => c.command === 'prepare').payload.config;
  assert.equal(config.output, 'studio');
  assert.equal(config.outputDir, undefined);
  assert.equal(config.screen.selection.mode, 'portal');
  assert.equal(config.camera.deviceId, 'camera-1');
  assert.equal(config.microphone.deviceId, 'mic-1');
  assert.equal(config.systemAudio.mode, 'default');
  for (const command of ['start', 'pause', 'resume', 'stop']) await h.request(command);
  assert.deepEqual(
    h.calls.slice(-4),
    ['start', 'pause', 'resume', 'stop'].map((command) => ({ command, payload: { sessionId: 'session-1' } })),
  );
  await assert.rejects(() => h.request('start'), /does not own/);
});
test('recording commands require the owner and the current session', async () => {
  const h = harness();
  await h.request('prepare');
  await assert.rejects(() => h.request('stop', {}, 2), /does not own/);
  await assert.rejects(() => h.request('stop', { sessionId: 'previous' }), /Stale/);
  await h.request('cancel');
  await assert.rejects(() => h.request('resume'), /does not own/);
});
test('preparation is serialized and respects the host gate', async () => {
  const denied = harness({ canStartRecording: () => false });
  await assert.rejects(() => denied.request('prepare'), /already active/);
  assert.equal(denied.calls.length, 0);
  const h = harness();
  const first = h.request('prepare');
  await assert.rejects(() => h.request('prepare'), /already active/);
  await first;
});
test('portal cancellation does not create an owner or start any recording', async () => {
  const h = harness();
  const original = h.engine.request;
  h.engine.request = async (command, payload) => {
    if (command === 'prepare') throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
    return original(command, payload);
  };
  assert.equal(await h.request('prepare'), null);
  await assert.rejects(() => h.request('start'), /does not own/);
});
test('shutdown rejects work and legacy recording commands have no fallback', async () => {
  const h = harness({ canAcceptWork: () => false });
  await assert.rejects(() => h.request('sources'), /shutdown/);
  const live = harness();
  await assert.rejects(() => live.request('native-media-start'), /Unsupported/);
  assert.deepEqual(await live.handlers.get('window:getSources')({}, []), []);
});
test('display bounds accepts only finite positive dimensions', () => {
  const screen = {
    getAllDisplays: () => [
      { id: 1, bounds: { x: -100, y: 0, width: 100, height: 80 } },
      { id: 2, bounds: { x: 0, y: 0, width: 0, height: 80 } },
    ],
  };
  assert.deepEqual(displayBoundsForId(screen, '1'), { x: -100, y: 0, width: 100, height: 80 });
  for (const id of ['', null, '2', '3']) assert.equal(displayBoundsForId(screen, id), null);
});
