const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const projectId = '11111111-1111-4111-8111-111111111111';

function fakeWindow(calls) {
  const listeners = new Map();
  const contentListeners = new Map();
  let destroyed = false;
  let maximized = false;
  const webContents = {
    id: 42,
    once: (event, listener) => contentListeners.set(event, listener),
    send: (...args) => calls.push(['editor-send', ...args]),
  };
  return {
    webContents,
    emitContent: (event) => contentListeners.get(event)?.(),
    on: (event, listener) => listeners.set(event, listener),
    isDestroyed: () => destroyed,
    isMaximized: () => maximized,
    isMinimized: () => false,
    maximize: () => {
      maximized = true;
      calls.push(['maximize']);
    },
    show: () => calls.push(['show']),
    hide: () => calls.push(['hide']),
    focus: () => calls.push(['focus']),
    close: () => {
      calls.push(['close']);
      listeners.get('closed')?.();
    },
    destroy: () => {
      destroyed = true;
      calls.push(['destroy']);
      listeners.get('closed')?.();
    },
    loadURL: (url) => calls.push(['loadURL', url]),
    loadFile: (...args) => calls.push(['loadFile', ...args]),
    setBackgroundColor: (color) => calls.push(['background', color]),
    setTitleBarOverlay: (options) => calls.push(['overlay', options]),
  };
}

test('editor window is opaque and routes native editor lifecycle without changing the HUD window', async () => {
  const calls = [];
  const windows = [];
  const ipcHandlers = new Map();
  const ipcListeners = new Map();
  const electron = {
    BrowserWindow: class {
      constructor(options) {
        calls.push(['constructor', options]);
        const window = fakeWindow(calls);
        windows.push(window);
        return window;
      }
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };

  try {
    const {
      EDITOR_MIN_SIZE,
      TITLEBAR_HEIGHT,
      TITLEBAR_SYMBOL_COLOR,
      createEditorWindowManager,
    } = require('../electron/window/editor-window.cjs');
    const hudWindow = {
      webContents: { send: (...args) => calls.push(['hud-send', ...args]) },
      hide: () => calls.push(['hud-hide']),
      show: () => calls.push(['hud-show']),
      focus: () => calls.push(['hud-focus']),
      close: () => calls.push(['hud-close']),
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: () => calls.push(['hud-restore']),
    };
    const hudController = { showHud: () => calls.push(['show-hud']) };
    const ipcMain = {
      handle: (channel, listener) => ipcHandlers.set(channel, listener),
      on: (channel, listener) => ipcListeners.set(channel, listener),
    };
    const registered = [];
    const manager = createEditorWindowManager({
      applicationRoot: '/app',
      isPackaged: false,
      ipcMain,
      hudWindow,
      hudController,
      registerController: (...args) => registered.push(args),
    });

    assert.throws(() => manager.open('project'), /invalide/);
    const opening = manager.open(projectId);
    const options = calls.find((call) => call[0] === 'constructor')[1];
    assert.equal(options.transparent, false);
    assert.equal(options.frame, true);
    assert.equal(options.titleBarStyle, 'hidden');
    assert.equal(options.thickFrame, true);
    assert.equal(options.minWidth, EDITOR_MIN_SIZE.width);
    assert.equal(options.minHeight, EDITOR_MIN_SIZE.height);
    if (process.platform !== 'darwin') {
      assert.deepEqual(options.titleBarOverlay, {
        color: '#00000000',
        symbolColor: TITLEBAR_SYMBOL_COLOR,
        height: TITLEBAR_HEIGHT,
      });
    }
    assert.equal(registered.length, 1);
    assert.equal(
      calls.some((call) => call[0] === 'hud-hide'),
      false,
      'the HUD loading state remains visible until the editor renderer is ready',
    );

    const editor = windows[0];
    assert.deepEqual(
      calls.find((call) => call[0] === 'hud-send' && call[1] === 'editor:loading-progress'),
      ['hud-send', 'editor:loading-progress', { stage: 'openingWindow', value: 10 }],
    );
    editor.emitContent('did-finish-load');
    assert.deepEqual(calls.at(-1), ['hud-send', 'editor:loading-progress', { stage: 'loadingEditor', value: 25 }]);
    ipcListeners.get('editor:loading-stage')({ sender: editor.webContents }, 'loadingTimeline');
    assert.deepEqual(calls.at(-1), ['hud-send', 'editor:loading-progress', { stage: 'loadingTimeline', value: 65 }]);
    assert.deepEqual(ipcHandlers.get('editor:context')({ sender: editor.webContents }), { projectId });
    ipcListeners.get('editor:ready')({ sender: editor.webContents });
    await opening;
    assert.ok(calls.some((call) => call[0] === 'hud-hide'));
    assert.ok(calls.some((call) => call[0] === 'show'));

    ipcListeners.get('editor:titlebar-theme')({ sender: editor.webContents }, true);
    assert.equal(
      calls.some((call) => call[0] === 'background' || call[0] === 'overlay'),
      false,
      'a live theme change must not mutate the native compositor surface',
    );

    manager.showHud();
    assert.ok(calls.some((call) => call[0] === 'show-hud'));
    assert.ok(calls.some((call) => call[0] === 'hud-show'));
    assert.ok(calls.some((call) => call[0] === 'hud-focus'));

    const reopening = manager.open(projectId);
    const reopenedEditor = windows[1];
    const reopenedOptions = calls.filter((call) => call[0] === 'constructor').at(-1)[1];
    assert.equal(reopenedOptions.backgroundColor, '#141310');
    ipcListeners.get('editor:ready')({ sender: reopenedEditor.webContents });
    await reopening;

    const configuration = { screenKind: 'display', cameraId: 'off' };
    ipcListeners.get('editor:start-recording')({ sender: reopenedEditor.webContents }, configuration);
    assert.deepEqual(
      calls.find((call) => call[0] === 'hud-send' && call[1] === 'editor:start-recording'),
      ['hud-send', 'editor:start-recording', configuration],
    );
  } finally {
    Module._load = originalLoad;
  }
});
