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

test('recovers a completed partial native session after stop rejects', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-capture-ipc-'));
  const manifestPath = path.join(root, 'manifest.json');
  fs.mkdirSync(path.join(root, 'screen'));
  fs.writeFileSync(manifestPath, JSON.stringify({ projectId: 'project-partial' }));
  fs.writeFileSync(path.join(root, 'screen', 'primary.mp4'), Buffer.from([1]));

  try {
    const handlers = new Map();
    const requests = [];
    let completeCalls = 0;
    const session = { state: 'completed', sessionId: 'session-partial', manifestPath };
    const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
    const captureEngine = {
      request: async (command) => {
        requests.push(command);
        if (command === 'stop') throw new Error('native source disappeared');
        if (command === 'status') return session;
        throw new Error(`unexpected capture command: ${command}`);
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
    assert.equal(stopped.state, 'completed');
    assert.equal(stopped.sessionId, 'session-partial');
    assert.equal(stopped.manifestPath, manifestPath);
    assert.equal(stopped.projectId, 'project-partial');
    assert.deepEqual(requests, ['stop', 'status']);

    const completed = await request({}, 'complete-native-recording');
    assert.equal(completeCalls, 1);
    assert.match(completed.videoSrc, /primary\.mp4$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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

test('wraps native errors with the failing command context', async () => {
  const handlers = new Map();
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const captureEngine = {
    request: async () => {
      throw new Error('boom');
    },
  };

  registerCaptureIpc({
    ipcMain,
    desktopCapturer: {},
    screen: {},
    captureEngine,
    app: {},
    userPaths: { projects: 'recordings' },
    trackStorages: [],
  });

  const request = handlers.get('capture:request');
  await assert.rejects(() => request({}, 'start-prepared-recording'), /capture-engine a échoué pour "start": boom/);
});

test('forwards system-audio preview commands and returns their engine responses', async () => {
  const handlers = new Map();
  const requests = [];
  const responses = {
    'start-system-audio-preview': { started: true },
    'system-audio-preview-level': { level: 0.42 },
    'stop-system-audio-preview': { stopped: true },
  };
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const captureEngine = {
    request: async (command, payload) => {
      requests.push({ command, payload });
      return responses[command];
    },
  };

  registerCaptureIpc({
    ipcMain,
    desktopCapturer: {},
    screen: {},
    captureEngine,
    app: {},
    userPaths: { projects: 'recordings' },
    trackStorages: [],
  });

  const request = handlers.get('capture:request');
  for (const [command, response] of Object.entries(responses)) {
    assert.deepEqual(await request({}, command), response);
  }

  assert.deepEqual(
    requests,
    Object.keys(responses).map((command) => ({ command, payload: {} })),
  );
});

test('invalidates the deferred session and rejects when the engine is poisoned', async () => {
  const handlers = new Map();
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  let poisoned = false;
  const captureEngine = {
    get isPoisoned() {
      return poisoned;
    },
    request: async (command) => {
      if (poisoned) {
        const error = new Error(`Délai dépassé pour la commande "${command}"`);
        error.code = 'capture-engine-poisoned';
        throw error;
      }
      return { state: 'stopped', sessionId: 'session-1', manifestPath: null };
    },
  };

  registerCaptureIpc({
    ipcMain,
    desktopCapturer: {},
    screen: {},
    captureEngine,
    app: {},
    userPaths: { projects: 'recordings' },
    trackStorages: [],
  });

  const request = handlers.get('capture:request');
  await request({}, 'stop-native-recording');
  poisoned = true;

  await assert.rejects(() => request({}, 'start-prepared-recording'), /capture-engine a échoué pour "start"/);
  await assert.rejects(() => request({}, 'complete-native-recording'), /No native recording is waiting/);
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

test('excludes the owner window from Electron source previews', async () => {
  const handlers = new Map();
  const previewCalls = [];
  const thumbnail = (label) => ({ toDataURL: () => `data:image/png;base64,${label}` });
  const sources = [
    { id: 'window:owner', name: 'Beam', thumbnail: thumbnail('owner'), appIcon: null },
    { id: 'window:other', name: 'Other app', thumbnail: thumbnail('other'), appIcon: null },
    { id: 'screen:1', name: 'Screen 1', thumbnail: thumbnail('screen'), appIcon: null, display_id: '1' },
  ];
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const screen = { getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }] };
  const desktopCapturer = {
    getSources: async (options) => {
      previewCalls.push(options);
      return sources;
    },
  };
  const event = { sender: {} };
  const ownerWindow = { getMediaSourceId: () => 'window:owner' };
  const BrowserWindow = { fromWebContents: (sender) => (sender === event.sender ? ownerWindow : null) };

  registerCaptureIpc({
    ipcMain,
    desktopCapturer,
    BrowserWindow,
    screen,
    captureEngine: { request: async () => undefined },
    app: {},
    userPaths: { projects: 'recordings' },
    trackStorages: [],
    platform: 'win32',
  });

  const getSources = handlers.get('window:getSources');
  const previews = await getSources(event, ['window', 'screen']);

  assert.deepEqual(
    previews.map(({ id }) => id),
    ['window:other', 'screen:1'],
  );
  assert.equal(previews[0].thumbnail, 'data:image/png;base64,other');
  assert.deepEqual(previews[1].displayBounds, { x: 0, y: 0, width: 1920, height: 1080 });
  assert.deepEqual(previewCalls, [
    {
      types: ['window', 'screen'],
      thumbnailSize: { width: 300, height: 200 },
      fetchWindowIcons: true,
    },
  ]);
});

test('keeps Electron sources when the owner window metadata is unavailable', async () => {
  const handlers = new Map();
  const thumbnail = { toDataURL: () => 'data:image/png;base64,source' };
  const sources = [{ id: 'window:source', name: 'Source', thumbnail, appIcon: null }];
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const desktopCapturer = { getSources: async () => sources };
  const BrowserWindow = { fromWebContents: (sender) => sender?.owner ?? null };

  registerCaptureIpc({
    ipcMain,
    desktopCapturer,
    BrowserWindow,
    screen: {},
    captureEngine: { request: async () => undefined },
    app: {},
    userPaths: { projects: 'recordings' },
    trackStorages: [],
    platform: 'win32',
  });

  const getSources = handlers.get('window:getSources');
  for (const event of [{}, { sender: {} }, { sender: { owner: {} } }]) {
    const previews = await getSources(event, ['window']);
    assert.deepEqual(
      previews.map(({ id }) => id),
      ['window:source'],
    );
  }
});

test('starts a Linux Portal recording from one catalog without an Electron preview preflight', async () => {
  const handlers = new Map();
  const requests = [];
  let previewCalls = 0;
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const desktopCapturer = {
    getSources: async () => {
      previewCalls += 1;
      throw new Error('desktopCapturer must not run before a Linux Portal recording');
    },
  };
  const captureEngine = {
    request: async (command, payload) => {
      requests.push({ command, payload });
      if (command === 'discover') {
        return {
          sources: [],
          capabilities: {
            separateCursor: true,
            cursorClicks: true,
            cursorShapes: true,
          },
        };
      }
      if (command === 'prepare') return { state: 'armed', sessionId: 'session-1' };
      if (command === 'start') return { state: 'recording', sessionId: 'session-1' };
      throw new Error(`unexpected capture command: ${command}`);
    },
  };

  registerCaptureIpc({
    ipcMain,
    desktopCapturer,
    screen: {},
    captureEngine,
    app: {},
    userPaths: { projects: 'recordings' },
    trackStorages: [],
    platform: 'linux',
  });

  const request = handlers.get('capture:request');
  const session = await request({}, 'start-default-recording', {
    options: { screenId: 'portal:monitor' },
  });

  assert.equal(session.sessionId, 'session-1');
  assert.deepEqual(
    requests.map(({ command }) => command),
    ['discover', 'prepare', 'start'],
  );
  assert.equal(requests.filter(({ command }) => command === 'discover').length, 1);
  assert.deepEqual(requests[1].payload.config.screen, {
    mode: 'portal',
    kind: 'monitor',
    restoreToken: null,
  });
  assert.equal(previewCalls, 0);
});

test('starts a prepared Linux Portal session without rediscovering or preparing it again', async () => {
  const handlers = new Map();
  const requests = [];
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const captureEngine = {
    request: async (command, payload) => {
      requests.push({ command, payload });
      if (command === 'discover') {
        return {
          sources: [],
          capabilities: {
            separateCursor: true,
            cursorClicks: true,
            cursorShapes: true,
          },
        };
      }
      if (command === 'prepare') return { state: 'armed', sessionId: 'session-2' };
      if (command === 'start') return { state: 'recording', sessionId: 'session-2' };
      throw new Error(`unexpected capture command: ${command}`);
    },
  };

  registerCaptureIpc({
    ipcMain,
    desktopCapturer: {},
    screen: {},
    captureEngine,
    app: {},
    userPaths: { projects: 'recordings' },
    trackStorages: [],
    platform: 'linux',
  });

  const request = handlers.get('capture:request');
  const prepared = await request({}, 'prepare-default-recording', {
    options: { screenId: 'portal:monitor' },
  });
  const started = await request({}, 'start-prepared-recording');

  assert.equal(prepared.sessionId, 'session-2');
  assert.equal(started.sessionId, 'session-2');
  assert.deepEqual(
    requests.map(({ command }) => command),
    ['discover', 'prepare', 'start'],
  );
  assert.equal(requests.filter(({ command }) => command === 'discover').length, 1);
  assert.equal(requests.filter(({ command }) => command === 'prepare').length, 1);
});

test('coalesces concurrent identical Linux Portal preparation requests', async () => {
  const handlers = new Map();
  const requests = [];
  let releasePrepare;
  const prepareGate = new Promise((resolve) => {
    releasePrepare = resolve;
  });
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const captureEngine = {
    request: async (command, payload) => {
      requests.push({ command, payload });
      if (command === 'discover') {
        return {
          sources: [],
          capabilities: {
            separateCursor: true,
            cursorClicks: true,
            cursorShapes: true,
          },
        };
      }
      if (command === 'prepare') return prepareGate;
      throw new Error(`unexpected capture command: ${command}`);
    },
  };

  registerCaptureIpc({
    ipcMain,
    desktopCapturer: {},
    screen: {},
    captureEngine,
    app: {},
    userPaths: { projects: 'recordings' },
    trackStorages: [],
    platform: 'linux',
  });

  const request = handlers.get('capture:request');
  const options = { projectId: 'project-concurrent', screenId: 'portal:monitor' };
  const first = request({}, 'prepare-default-recording', { options });
  const second = request({}, 'prepare-default-recording', { options });
  await new Promise((resolve) => setImmediate(resolve));
  releasePrepare({ state: 'armed', sessionId: 'session-concurrent' });
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult.sessionId, 'session-concurrent');
  assert.equal(secondResult.sessionId, 'session-concurrent');
  assert.deepEqual(
    requests.map(({ command }) => command),
    ['discover', 'prepare'],
    'concurrent preparation must share one discovery and one native Portal prepare',
  );
});

test('does not prepare the Linux Portal during discovery/previews and starts it once after the user request', async () => {
  const handlers = new Map();
  const requests = [];
  const catalog = {
    sources: [
      {
        id: 'portal:monitor',
        kind: 'display',
        isDefault: true,
        selectionMode: 'portal',
      },
    ],
    capabilities: { portalSelection: true, separateCursor: true },
  };
  const session = { state: 'recording', sessionId: 'session-portal-1' };
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const captureEngine = {
    request: async (command, payload) => {
      requests.push({ command, payload });
      if (command === 'discover') return catalog;
      if (command === 'prepare') return { state: 'armed', sessionId: 'session-portal-1' };
      if (command === 'start') return session;
      return undefined;
    },
  };

  registerCaptureIpc({
    ipcMain,
    desktopCapturer: {
      getSources: async () => {
        throw new Error('desktopCapturer must not run on Linux');
      },
    },
    screen: {},
    captureEngine,
    app: {},
    userPaths: { projects: 'recordings' },
    trackStorages: [],
    platform: 'linux',
  });

  const request = handlers.get('capture:request');
  const getSources = handlers.get('window:getSources');
  await request({}, 'discover');
  await getSources({}, ['screen']);
  await getSources({}, ['window']);
  assert.deepEqual(
    requests.map(({ command }) => command),
    ['discover'],
    'catalog and previews must not prepare or start a Portal session',
  );

  const started = await request({}, 'start-default-recording', {
    options: { screenKind: 'display', screenId: 'portal:monitor' },
  });
  assert.equal(started.sessionId, 'session-portal-1');
  assert.deepEqual(
    requests.map(({ command }) => command),
    ['discover', 'discover', 'prepare', 'start'],
  );
  assert.equal(requests.filter(({ command }) => command === 'prepare').length, 1);
  assert.equal(requests.filter(({ command }) => command === 'start').length, 1);
  assert.deepEqual(requests.find(({ command }) => command === 'prepare')?.payload.config.screen, {
    mode: 'portal',
    kind: 'monitor',
    restoreToken: null,
  });
});

test('forwards macOS source previews to the native engine with the same source id', async () => {
  const handlers = new Map();
  const requests = [];
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const captureEngine = {
    request: async (command, payload) => {
      requests.push({ command, payload });
      assert.equal(command, 'source-preview');
      return {
        sourceId: payload.source,
        thumbnail: 'data:image/jpeg;base64,/9j/native-preview',
      };
    },
  };

  registerCaptureIpc({
    ipcMain,
    desktopCapturer: {},
    screen: {},
    captureEngine,
    app: {},
    userPaths: { projects: 'recordings' },
    trackStorages: [],
    platform: 'darwin',
  });

  const getSourcePreview = handlers.get('capture:source-preview');
  assert.equal(typeof getSourcePreview, 'function');
  const result = await getSourcePreview(
    {},
    {
      sourceId: 'sck:window:42',
      maxWidth: 320,
      maxHeight: 180,
    },
  );

  assert.deepEqual(result, {
    sourceId: 'sck:window:42',
    thumbnail: 'data:image/jpeg;base64,/9j/native-preview',
    status: 'ready',
  });
  assert.deepEqual(requests, [
    {
      command: 'source-preview',
      payload: { source: 'sck:window:42', maxWidth: 320, maxHeight: 180 },
    },
  ]);
});

test('rejects source previews during shutdown before contacting the native engine', async () => {
  const handlers = new Map();
  let requests = 0;
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const captureEngine = {
    request: async () => {
      requests += 1;
      throw new Error('capture engine must not be contacted during shutdown');
    },
  };

  registerCaptureIpc({
    ipcMain,
    desktopCapturer: {},
    screen: {},
    captureEngine,
    app: {},
    userPaths: { projects: 'recordings' },
    trackStorages: [],
    platform: 'darwin',
    canAcceptWork: () => false,
  });

  const getSourcePreview = handlers.get('capture:source-preview');
  await assert.rejects(
    async () => getSourcePreview({}, { sourceId: 'sck:window:42' }),
    (error) => {
      assert.equal(error.code, 'application-shutting-down');
      return true;
    },
  );
  assert.equal(requests, 0);
});
