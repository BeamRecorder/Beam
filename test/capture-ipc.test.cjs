const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { registerCaptureIpc } = require('../electron/capture/capture-ipc.cjs');

test('stops native capture before completing sidecar tracks', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-capture-ipc-'));
  const manifestPath = path.join(root, 'manifest.json');
  fs.mkdirSync(path.join(root, 'screen'));
  fs.writeFileSync(manifestPath, JSON.stringify({ projectId: 'project-1' }));
  fs.writeFileSync(path.join(root, 'screen', 'primary.mp4'), Buffer.from([1]));

  const handlers = new Map();
  const requests = [];
  let completeCalls = 0;
  const session = { state: 'completed', sessionId: 'session-1', manifestPath };
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const captureEngine = {
    request: async (command) => {
      requests.push(command);
      return session;
    },
  };
  const storage = {
    registerSession: () => undefined,
    complete: (value) => {
      completeCalls += 1;
      return value;
    },
  };

  registerCaptureIpc({
    ipcMain,
    desktopCapturer: {},
    screen: {},
    captureEngine,
    app: {},
    userPaths: { projects: root },
    trackStorages: [storage],
  });
  const request = handlers.get('capture:request');

  const stopped = await request({}, 'stop-native-recording');
  assert.equal(stopped.projectId, 'project-1');
  assert.deepEqual(requests, ['stop']);
  assert.equal(completeCalls, 0);

  const completed = await request({}, 'complete-native-recording');
  assert.equal(completeCalls, 1);
  assert.match(completed.videoSrc, /primary\.mp4$/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('resolves display bounds by native display id without relying on desktop previews', async () => {
  const handlers = new Map();
  let previewCalls = 0;
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const desktopCapturer = {
    getSources: async () => {
      previewCalls += 1;
      return [];
    },
  };
  const screen = {
    getAllDisplays: () => [
      { id: 42, bounds: { x: 0, y: 0, width: 2560, height: 1440 } },
      { id: 84, bounds: { x: 2560, y: 0, width: 1920, height: 1080 } },
    ],
  };

  registerCaptureIpc({
    ipcMain,
    desktopCapturer,
    screen,
    captureEngine: { request: async () => undefined },
    app: {},
    userPaths: { projects: 'recordings' },
    trackStorages: [],
  });

  const getDisplayBounds = handlers.get('screen:get-display-bounds');
  assert.equal(typeof getDisplayBounds, 'function');
  assert.deepEqual(await getDisplayBounds({}, '42'), { x: 0, y: 0, width: 2560, height: 1440 });
  assert.deepEqual(await getDisplayBounds({}, '84'), { x: 2560, y: 0, width: 1920, height: 1080 });
  assert.equal(await getDisplayBounds({}, '999'), null);
  assert.equal(await getDisplayBounds({}, null), null);
  assert.equal(previewCalls, 0);
});

test('does not enumerate Electron sources on the Linux Portal path', async () => {
  const handlers = new Map();
  let previewCalls = 0;
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const desktopCapturer = {
    getSources: async () => {
      previewCalls += 1;
      throw new Error('desktopCapturer must not run on Linux');
    },
  };

  registerCaptureIpc({
    ipcMain,
    desktopCapturer,
    screen: {},
    captureEngine: { request: async () => undefined },
    app: {},
    userPaths: { projects: 'recordings' },
    trackStorages: [],
    platform: 'linux',
  });

  const getSources = handlers.get('window:getSources');
  assert.equal(typeof getSources, 'function');
  assert.deepEqual(await getSources({}, ['window']), []);
  assert.equal(previewCalls, 0);
});
