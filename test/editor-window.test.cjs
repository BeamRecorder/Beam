const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const projectId = '11111111-1111-4111-8111-111111111111';

function fakeWindow(calls, options = {}) {
  const listeners = new Map();
  const contentListeners = new Map();
  let destroyed = false;
  let maximized = false;
  const bounds = {
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: options.width ?? 1280,
    height: options.height ?? 800,
  };
  const webContents = {
    id: 42,
    on: (event, listener) => contentListeners.set(event, listener),
    once: (event, listener) => contentListeners.set(event, listener),
    send: (...args) => calls.push(['editor-send', ...args]),
    openDevTools: (...args) => calls.push(['openDevTools', ...args]),
    closeDevTools: () => calls.push(['closeDevTools']),
    isDevToolsOpened: () => false,
  };
  return {
    webContents,
    emitContent: (event) => contentListeners.get(event)?.(),
    on: (event, listener) => listeners.set(event, listener),
    emit: (event, ...args) => listeners.get(event)?.(...args),
    isDestroyed: () => destroyed,
    isMaximized: () => maximized,
    isMinimized: () => false,
    isFullScreen: () => false,
    getBounds: () => ({ ...bounds }),
    setBounds: (next) => Object.assign(bounds, next),
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
        const window = fakeWindow(calls, options);
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
    let hudVisible = true;
    let hudCanHide = true;
    const hudWindow = {
      webContents: { send: (...args) => calls.push(['hud-send', ...args]) },
      hide: () => calls.push(['hud-hide']),
      show: () => calls.push(['hud-show']),
      focus: () => calls.push(['hud-focus']),
      close: () => calls.push(['hud-close']),
      isDestroyed: () => false,
      isVisible: () => hudVisible,
      isMinimized: () => false,
      restore: () => calls.push(['hud-restore']),
    };
    const hudController = {
      showHud: () => calls.push(['show-hud']),
      setHudInteractive: (value) => calls.push(['hud-interactive', value]),
      setVisible: (value) => {
        if (!value && !hudCanHide) return false;
        hudVisible = value;
        calls.push(['hud-visible', value]);
        return true;
      },
    };
    const ipcMain = {
      handle: (channel, listener) => ipcHandlers.set(channel, listener),
      on: (channel, listener) => ipcListeners.set(channel, listener),
    };
    const registered = [];
    const appIconPath = '/app/dist/brand/BeamIcon.png';
    const manager = createEditorWindowManager({
      applicationRoot: '/app',
      isPackaged: false,
      ipcMain,
      hudWindow,
      hudController,
      registerController: (...args) => registered.push(args),
      appIconPath,
    });

    assert.throws(() => manager.open('project'), /invalide/);
    const opening = manager.open(projectId);
    const options = calls.find((call) => call[0] === 'constructor')[1];
    assert.equal(options.transparent, false);
    assert.equal(options.frame, true);
    assert.equal(options.titleBarStyle, 'hidden');
    assert.equal(options.thickFrame, true);
    assert.equal(options.icon, appIconPath);
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
    assert.ok(calls.some((call) => call[0] === 'hud-interactive' && call[1] === true));

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
    const hudHiddenIndex = calls.findIndex((call) => call[0] === 'hud-visible' && call[1] === false);
    const readyProgressIndex = calls.findIndex(
      (call) => call[0] === 'hud-send' && call[1] === 'editor:loading-progress' && call[2]?.stage === 'ready',
    );
    const editorShowIndex = calls.findIndex((call) => call[0] === 'show');
    const editorFocusIndex = calls.findIndex((call) => call[0] === 'focus');
    assert.ok(hudHiddenIndex >= 0);
    assert.equal(hudWindow.isVisible(), false);
    assert.ok(hudHiddenIndex < readyProgressIndex, 'the HUD must be hidden before ready progress is sent');
    assert.ok(readyProgressIndex < editorShowIndex, 'ready progress must precede editor.show()');
    assert.ok(editorShowIndex < editorFocusIndex, 'editor.show() must precede editor.focus()');

    const editorShows = calls.filter((call) => call[0] === 'show').length;
    hudVisible = true;
    hudCanHide = false;
    assert.throws(
      () => manager.open(projectId),
      /HUD n’a pas pu être masquée/,
      'the editor must not be presented if the native HUD remains visible',
    );
    assert.equal(calls.filter((call) => call[0] === 'show').length, editorShows);
    hudCanHide = true;
    hudVisible = false;

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

test('restores and persists editor window dimensions via preferencesStore', async () => {
  const calls = [];
  const windows = [];
  const patches = [];
  const preferenceState = { extras: { editorWindow: { width: 1400, height: 900 } } };
  const preferencesStore = {
    read: () => structuredClone(preferenceState),
    patch: (patch) => {
      patches.push(structuredClone(patch));
      preferenceState.extras = { ...preferenceState.extras, ...(patch.extras || {}) };
      return structuredClone(preferenceState);
    },
  };
  const electron = {
    BrowserWindow: class {
      constructor(options) {
        calls.push(['constructor', options]);
        const window = fakeWindow(calls, options);
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
    delete require.cache[require.resolve('../electron/window/editor-window.cjs')];
    const { createEditorWindowManager } = require('../electron/window/editor-window.cjs');
    const hudWindow = {
      webContents: { send: () => undefined },
      hide: () => undefined,
      show: () => undefined,
      focus: () => undefined,
      close: () => undefined,
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: () => undefined,
    };
    const manager = createEditorWindowManager({
      applicationRoot: '/app',
      isPackaged: false,
      ipcMain: { handle: () => undefined, on: () => undefined },
      hudWindow,
      hudController: { showHud: () => undefined },
      registerController: () => undefined,
      preferencesStore,
    });

    manager.open(projectId);
    const options = calls.find((call) => call[0] === 'constructor')[1];
    assert.equal(options.width, 1400);
    assert.equal(options.height, 900);

    const editor = windows[0];
    editor.setBounds({ width: 1600, height: 950 });
    editor.emit('resized');

    assert.deepEqual(patches.at(-1)?.extras?.editorWindow, {
      width: 1600,
      height: 950,
      isMaximized: false,
    });

    editor.maximize();
    editor.emit('maximize');
    assert.equal(patches.at(-1)?.extras?.editorWindow?.isMaximized, true);
    assert.equal(patches.at(-1)?.extras?.editorWindow?.width, 1600);
    assert.equal(patches.at(-1)?.extras?.editorWindow?.height, 950);

    manager.showHud();

    // Reopen editor to verify maximized state is restored
    manager.open(projectId);
    assert.ok(calls.some((call) => call[0] === 'maximize'));
  } finally {
    Module._load = originalLoad;
  }
});
