const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const test = require('node:test');
const { isHudSourcePickerOwner } = require('../electron/source-picker/source-picker-ipc.cjs');

test('only the current session port can own the development source picker', () => {
  const environment = { BEAM_DEV_SERVER_URL: 'http://localhost:6508' };
  assert.equal(isHudSourcePickerOwner('http://localhost:6508/html/index.html', '/beam', false, environment), true);
  for (const url of [
    'http://localhost:6500/html/index.html',
    'http://localhost:6508/html/editor.html',
    'http://localhost:6508/html/index.html?quickSnipCrop=1',
    'http://localhost:6508/html/index.html#one',
  ]) {
    assert.equal(isHudSourcePickerOwner(url, '/beam', false, environment), false);
  }
});

test('packaged source-picker ownership ignores the development origin', () => {
  const environment = { BEAM_DEV_SERVER_URL: 'http://localhost:6508' };
  assert.equal(isHudSourcePickerOwner('file:///beam/dist/html/index.html', '/beam', true, environment), true);
  assert.equal(isHudSourcePickerOwner('http://localhost:6508/html/index.html', '/beam', true, environment), false);
  assert.equal(isHudSourcePickerOwner('invalid', '/beam', false, environment), false);
});

function fixture({ platform = 'win32', isPackaged = false, accepting = true, startPicker } = {}) {
  const handlers = new Map();
  const ipcMain = new EventEmitter();
  const app = new EventEmitter();
  app.isPackaged = isPackaged;
  ipcMain.handle = (channel, handler) => handlers.set(channel, handler);
  const calls = [];
  const chooser = {};
  const manager = {
    open: (kind) => {
      calls.push(['open', kind]);
      return startPicker ? startPicker(kind) : Promise.resolve(null);
    },
    ownsChooser: (sender) => sender === chooser,
    action: (action) => {
      if (!action?.type) throw new Error('Invalid selection');
      calls.push(['action', action]);
    },
    reportError: (error) => calls.push(['error', error.message]),
    markReady: (sender) => calls.push(['ready', sender]),
    destroy: () => calls.push(['destroy']),
  };
  const originalLoad = Module._load;
  const file = require.resolve('../electron/source-picker/source-picker-ipc.cjs');
  delete require.cache[file];
  Module._load = function (request, parent, isMain) {
    if (request === './source-picker-controller.cjs') return { createSourcePickerController: () => manager };
    return originalLoad.call(this, request, parent, isMain);
  };
  let api;
  try {
    const { registerSourcePickerIpc } = require(file);
    api = registerSourcePickerIpc({
      ipcMain,
      app,
      platform,
      applicationRoot: '/beam',
      canAcceptWork: () => accepting,
      BrowserWindow: {
        fromWebContents: (sender) => ({
          webContents: sender,
          isDestroyed: () => false,
          once: () => {},
          getBounds: () => ({}),
        }),
      },
      screen: { getDisplayMatching: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    });
  } finally {
    Module._load = originalLoad;
    delete require.cache[file];
  }
  const owner = {
    getURL: () => (isPackaged ? 'file:///beam/dist/html/index.html' : 'http://localhost:6500/html/index.html'),
  };
  return {
    calls,
    app,
    ipcMain,
    chooser,
    owner,
    api,
    open: (sender = owner) => handlers.get('source-picker:open')({ sender }, 'window'),
  };
}

test('only the HUD owner opens selection and only its chooser can send actions', async () => {
  const { calls, open, owner, chooser, ipcMain } = fixture();
  assert.throws(() => open({ getURL: () => 'http://localhost:6500/html/editor.html' }), /Only the HUD/);
  await open();
  await open({ ...owner });
  ipcMain.emit('source-picker:action', { sender: owner }, { type: 'cancel' });
  assert.deepEqual(calls, [
    ['open', 'window'],
    ['open', 'window'],
  ]);
  ipcMain.emit('source-picker:action', { sender: chooser }, { type: 'cancel' });
  ipcMain.emit('source-picker:action', { sender: chooser }, null);
  assert.deepEqual(calls.slice(-2), [
    ['action', { type: 'cancel' }],
    ['error', 'Invalid selection'],
  ]);
});
test('keeps a pending chooser owned by one toolbar until selection completes', async () => {
  let finish;
  const f = fixture({
    startPicker: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const pending = f.open();
  assert.throws(() => f.open({ ...f.owner }), /Another toolbar/);
  finish(null);
  await pending;
  const next = f.open({ ...f.owner });
  finish(null);
  await next;
});
test('allows the internal Quick Snip toolbar but keeps public source IPC restricted to the HUD', async () => {
  const f = fixture();
  const sender = { getURL: () => 'http://localhost:6500/html/index.html?quickSnipCrop=1' };
  assert.throws(() => f.open(sender), /Only the HUD/);
  await f.api.openForWindow(
    { webContents: sender, isDestroyed: () => false, once() {}, getBounds: () => ({}) },
    'screen',
  );
  assert.deepEqual(f.calls, [['open', 'screen']]);
});
test('rejects malformed kinds and releases ownership after a synchronous picker failure', async () => {
  let failing = true;
  const f = fixture({
    startPicker: () => {
      if (failing) throw new Error('renderer unavailable');
      return Promise.resolve(null);
    },
  });
  const parent = { webContents: f.owner, isDestroyed: () => false, once() {}, getBounds: () => ({}) };
  assert.throws(() => f.api.openForWindow(parent, 'region'), /Invalid/);
  assert.throws(() => f.open(), /renderer unavailable/);
  failing = false;
  await f.open({ ...f.owner });
});

test('normal Linux and packaged Linux reject custom selection even with a development environment flag', () => {
  const previous = process.env.DEV_CROSSPLATFORM;
  try {
    delete process.env.DEV_CROSSPLATFORM;
    assert.throws(() => fixture({ platform: 'linux' }).open(), /Portal/);
    process.env.DEV_CROSSPLATFORM = '1';
    assert.throws(() => fixture({ platform: 'linux', isPackaged: true }).open(), /Portal/);
  } finally {
    if (previous === undefined) delete process.env.DEV_CROSSPLATFORM;
    else process.env.DEV_CROSSPLATFORM = previous;
  }
});

test('development data permits Linux to exercise the same chooser', async () => {
  const previous = process.env.DEV_CROSSPLATFORM;
  try {
    process.env.DEV_CROSSPLATFORM = '1';
    const { open, calls } = fixture({ platform: 'linux' });
    await open();
    assert.deepEqual(calls, [['open', 'window']]);
  } finally {
    if (previous === undefined) delete process.env.DEV_CROSSPLATFORM;
    else process.env.DEV_CROSSPLATFORM = previous;
  }
});

test('shutdown rejects new selection and disposes existing auxiliary windows', async () => {
  assert.throws(() => fixture({ accepting: false }).open(), /shutdown/);
  const { app, calls, open, ipcMain, chooser } = fixture();
  await open();
  ipcMain.emit('source-picker:ready', { sender: chooser });
  app.emit('before-quit');
  assert.deepEqual(calls.slice(-2), [['ready', chooser], ['destroy']]);
});
