const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const test = require('node:test');

function fixture({ platform = 'win32', isPackaged = false, accepting = true } = {}) {
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
      return Promise.resolve(null);
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
  const file = require.resolve('../apps/desktop/electron/source-picker/source-picker-ipc.cjs');
  delete require.cache[file];
  Module._load = function (request, parent, isMain) {
    if (request === './source-picker-controller.cjs') return { createSourcePickerController: () => manager };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { registerSourcePickerIpc } = require(file);
    registerSourcePickerIpc({
      ipcMain,
      app,
      platform,
      applicationRoot: '/beam',
      canAcceptWork: () => accepting,
      BrowserWindow: {
        fromWebContents: () => ({
          isDestroyed: () => false,
          getBounds: () => ({}),
        }),
      },
      screen: {
        getDisplayMatching: () => ({
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        }),
      },
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
    open: (sender = owner) => handlers.get('source-picker:open')({ sender }, 'window'),
  };
}

test('only the HUD owner opens selection and only its chooser can send actions', async () => {
  const { calls, open, owner, chooser, ipcMain } = fixture();
  assert.throws(() => open({ getURL: () => 'http://localhost:6500/html/editor.html' }), /Only the HUD/);
  await open();
  assert.throws(() => open({ ...owner }), /Another HUD/);
  ipcMain.emit('source-picker:action', { sender: owner }, { type: 'cancel' });
  assert.deepEqual(calls, [['open', 'window']]);
  ipcMain.emit('source-picker:action', { sender: chooser }, { type: 'cancel' });
  ipcMain.emit('source-picker:action', { sender: chooser }, null);
  assert.deepEqual(calls.slice(-2), [
    ['action', { type: 'cancel' }],
    ['error', 'Invalid selection'],
  ]);
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
