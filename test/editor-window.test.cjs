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

    const reopening = manager.open(projectId, { disposition: 'new-window' });
    const reopenedEditor = windows[1];
    const reopenedOptions = calls.filter((call) => call[0] === 'constructor').at(-1)[1];
    assert.equal(reopenedOptions.backgroundColor, '#141310');
    ipcListeners.get('editor:ready')({ sender: reopenedEditor.webContents });
    await reopening;

    assert.equal(await ipcHandlers.get('editor:open-recorder')({ sender: reopenedEditor.webContents }), true);
    assert.ok(calls.some((call) => call[0] === 'hud-send' && call[1] === 'editor:recorder-launcher'));
  } finally {
    Module._load = originalLoad;
  }
});

const createThemeFixture = ({ theme, resolveSystemDark = () => false }) => {
  const calls = [];
  const windows = [];
  const ipcHandlers = new Map();
  const ipcListeners = new Map();
  const preferenceState = { theme, extras: {} };
  const preferencesStore = {
    read: () => structuredClone(preferenceState),
    patch: (patch) => {
      Object.assign(preferenceState, patch);
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
  delete require.cache[require.resolve('../electron/window/editor-window.cjs')];
  const { createEditorWindowManager } = require('../electron/window/editor-window.cjs');
  let hudVisible = true;
  const hudWindow = {
    webContents: { send: (...args) => calls.push(['hud-send', ...args]) },
    hide: () => {
      hudVisible = false;
      calls.push(['hud-hide']);
    },
    show: () => {
      hudVisible = true;
      calls.push(['hud-show']);
    },
    focus: () => calls.push(['hud-focus']),
    close: () => calls.push(['hud-close']),
    isDestroyed: () => false,
    isVisible: () => hudVisible,
    isMinimized: () => false,
    restore: () => calls.push(['hud-restore']),
  };
  const manager = createEditorWindowManager({
    applicationRoot: '/app',
    isPackaged: false,
    ipcMain: {
      handle: (channel, listener) => ipcHandlers.set(channel, listener),
      on: (channel, listener) => ipcListeners.set(channel, listener),
    },
    hudWindow,
    hudController: {
      showHud: () => calls.push(['show-hud']),
      setVisible: (visible) => {
        hudVisible = visible;
        calls.push(['hud-visible', visible]);
        return true;
      },
    },
    registerController: () => undefined,
    preferencesStore,
    resolveSystemDark,
  });
  return {
    calls,
    windows,
    ipcHandlers,
    ipcListeners,
    manager,
    preferenceState,
    restore: () => {
      Module._load = originalLoad;
    },
  };
};

const readyEditor = async (fixture, opening) => {
  const editor = fixture.windows.at(-1);
  fixture.ipcListeners.get('editor:ready')({ sender: editor.webContents });
  await opening;
  return editor;
};

test('uses the current preference theme for every editor creation without live native background changes', async () => {
  for (const [firstTheme, secondTheme] of [
    ['dark', 'light'],
    ['light', 'dark'],
  ]) {
    const fixture = createThemeFixture({ theme: firstTheme });
    try {
      const firstOpening = fixture.manager.open(projectId);
      assert.equal(
        fixture.calls.find((call) => call[0] === 'constructor')[1].backgroundColor,
        firstTheme === 'dark' ? '#141310' : '#f7f5f0',
      );
      const firstEditor = await readyEditor(fixture, firstOpening);

      fixture.manager.showHud();
      fixture.preferenceState.theme = secondTheme;
      const secondOpening = fixture.manager.open(projectId, { disposition: 'new-window' });
      const secondOptions = fixture.calls.filter((call) => call[0] === 'constructor').at(-1)[1];
      assert.equal(secondOptions.backgroundColor, secondTheme === 'dark' ? '#141310' : '#f7f5f0');
      const secondEditor = await readyEditor(fixture, secondOpening);

      fixture.ipcListeners.get('editor:titlebar-theme')({ sender: secondEditor.webContents }, secondTheme === 'dark');
      assert.equal(fixture.calls.filter((call) => call[0] === 'background' || call[0] === 'overlay').length, 0);
      assert.notEqual(firstEditor, secondEditor);
    } finally {
      fixture.restore();
    }
  }
});

test('resolves system theme from the current callback on every editor creation', async () => {
  let systemDark = false;
  let resolveCalls = 0;
  const fixture = createThemeFixture({
    theme: 'system',
    resolveSystemDark: () => {
      resolveCalls += 1;
      return systemDark;
    },
  });
  try {
    const firstOpening = fixture.manager.open(projectId);
    assert.equal(fixture.calls.find((call) => call[0] === 'constructor')[1].backgroundColor, '#f7f5f0');
    await readyEditor(fixture, firstOpening);

    fixture.manager.showHud();
    systemDark = true;
    const secondOpening = fixture.manager.open(projectId, { disposition: 'new-window' });
    assert.equal(fixture.calls.filter((call) => call[0] === 'constructor').at(-1)[1].backgroundColor, '#141310');
    await readyEditor(fixture, secondOpening);

    assert.equal(resolveCalls, 2);
  } finally {
    fixture.restore();
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

    const firstOpening = manager.open(projectId);
    void firstOpening.catch(() => undefined);
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

    // Open an independent editor to verify maximized state is restored.
    void manager.open(projectId, { disposition: 'new-window' });
    assert.ok(calls.some((call) => call[0] === 'maximize'));
  } finally {
    Module._load = originalLoad;
  }
});

function createRecorderFixture() {
  const calls = [];
  const windows = [];
  const ipcHandlers = new Map();
  const ipcListeners = new Map();
  let hudVisible = true;
  const hudWebContents = { send: (...args) => calls.push(['hud-send', ...args]) };
  const hudWindow = {
    webContents: hudWebContents,
    hide: () => {
      hudVisible = false;
      calls.push(['hud-hide']);
    },
    show: () => {
      hudVisible = true;
      calls.push(['hud-show']);
    },
    focus: () => calls.push(['hud-focus']),
    close: () => calls.push(['hud-close']),
    isDestroyed: () => false,
    isVisible: () => hudVisible,
    isMinimized: () => false,
    restore: () => calls.push(['hud-restore']),
  };
  const electron = {
    BrowserWindow: class {
      constructor(options) {
        const editor = fakeWindow(calls, options);
        const sourceId = `window:beam-editor-${windows.length + 1}`;
        editor.mediaSourceCalls = [];
        editor.getMediaSourceId = () => {
          editor.mediaSourceCalls.push(sourceId);
          calls.push(['media-source', sourceId]);
          return sourceId;
        };
        editor.closeCount = 0;
        const close = editor.close;
        editor.close = () => {
          editor.closeCount += 1;
          close();
        };
        editor.focusCount = 0;
        const focus = editor.focus;
        editor.focus = () => {
          editor.focusCount += 1;
          focus();
        };
        windows.push(editor);
        return editor;
      }
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[require.resolve('../electron/window/editor-window.cjs')];
  const { createEditorWindowManager } = require('../electron/window/editor-window.cjs');
  const manager = createEditorWindowManager({
    applicationRoot: '/app',
    isPackaged: false,
    ipcMain: {
      handle: (channel, listener) => ipcHandlers.set(channel, listener),
      on: (channel, listener) => ipcListeners.set(channel, listener),
    },
    hudWindow,
    hudController: {
      showHud: () => calls.push(['show-hud']),
      setHudInteractive: (value) => calls.push(['hud-interactive', value]),
      setVisible: (value) => {
        hudVisible = value;
        calls.push(['hud-visible', value]);
        return true;
      },
    },
    registerController: () => undefined,
  });
  return {
    calls,
    windows,
    ipcHandlers,
    ipcListeners,
    hudWindow,
    manager,
    restore: () => {
      manager.destroy();
      Module._load = originalLoad;
    },
  };
}

test('editor:open-recorder keeps the editor open, shows the real HUD, and supplies its media source', async () => {
  const fixture = createRecorderFixture();
  try {
    const opening = fixture.manager.open(projectId);
    const origin = await readyEditor(fixture, opening);
    const closeCount = origin.closeCount;
    fixture.calls.length = 0;

    const opened = await fixture.ipcHandlers.get('editor:open-recorder')({ sender: origin.webContents });
    assert.equal(opened, true);
    assert.equal(fixture.manager.window(), origin);
    assert.equal(origin.closeCount, closeCount);
    assert.equal(fixture.hudWindow.isVisible(), true);
    assert.ok(fixture.calls.some((call) => call[0] === 'show-hud'));
    assert.ok(fixture.calls.some((call) => call[0] === 'hud-show'));

    const launcher = fixture.calls.find((call) => call[0] === 'hud-send' && call[1] === 'editor:recorder-launcher');
    assert.ok(launcher);
    assert.equal(typeof launcher[2].requestId, 'string');
    assert.equal(launcher[2].preferredKind, 'window');
    assert.equal(launcher[2].preferredSourceId, process.platform === 'linux' ? null : 'window:beam-editor-1');
    assert.deepEqual(origin.mediaSourceCalls, process.platform === 'linux' ? [] : ['window:beam-editor-1']);
  } finally {
    fixture.restore();
  }
});

test('editor:dismiss-recorder hides the HUD and refocuses its originating editor', async () => {
  const fixture = createRecorderFixture();
  try {
    const opening = fixture.manager.open(projectId);
    const origin = await readyEditor(fixture, opening);
    await fixture.ipcHandlers.get('editor:open-recorder')({ sender: origin.webContents });
    const focusCount = origin.focusCount;

    assert.equal(
      await fixture.ipcHandlers.get('editor:dismiss-recorder')({ sender: fixture.hudWindow.webContents }),
      true,
    );
    assert.equal(fixture.hudWindow.isVisible(), false);
    assert.ok(origin.focusCount > focusCount);
    assert.equal(fixture.manager.window(), origin);
    assert.ok(fixture.calls.some((call) => call[0] === 'hud-visible' && call[1] === false));
  } finally {
    fixture.restore();
  }
});

test('editor:open new-window keeps IPC contexts independent and closing one editor preserves the other', async () => {
  const fixture = createRecorderFixture();
  try {
    const firstOpening = fixture.manager.open(projectId);
    const first = await readyEditor(fixture, firstOpening);
    const secondProjectId = '22222222-2222-4222-8222-222222222222';
    const secondOpening = fixture.ipcHandlers.get('editor:open')({ sender: first.webContents }, secondProjectId, {
      disposition: 'new-window',
    });
    assert.equal(fixture.windows.length, 2);
    const second = fixture.windows[1];
    assert.notEqual(first, second);
    assert.equal(first.closeCount, 0);
    await readyEditor(fixture, secondOpening);

    assert.deepEqual(fixture.ipcHandlers.get('editor:context')({ sender: first.webContents }), { projectId });
    assert.deepEqual(fixture.ipcHandlers.get('editor:context')({ sender: second.webContents }), {
      projectId: secondProjectId,
    });

    const secondCloseCount = second.closeCount;
    first.emit('closed');
    assert.equal(second.closeCount, secondCloseCount);
    assert.equal(second.isDestroyed(), false);
    assert.deepEqual(fixture.ipcHandlers.get('editor:context')({ sender: second.webContents }), {
      projectId: secondProjectId,
    });

    const foreign = fakeWindow(fixture.calls);
    assert.equal(await fixture.ipcHandlers.get('editor:open-recorder')({ sender: foreign.webContents }), false);
    assert.equal(fixture.ipcHandlers.get('editor:context')({ sender: foreign.webContents }), null);
    assert.equal(await fixture.ipcHandlers.get('editor:dismiss-recorder')({ sender: foreign.webContents }), false);
  } finally {
    fixture.restore();
  }
});

test('recorder launch is idempotent while idle and only the HUD may mark it active', async () => {
  const fixture = createRecorderFixture();
  try {
    const opening = fixture.manager.open(projectId);
    const origin = await readyEditor(fixture, opening);
    const firstOpen = await fixture.ipcHandlers.get('editor:open-recorder')({ sender: origin.webContents });
    const firstContext = fixture.calls
      .filter((call) => call[0] === 'hud-send' && call[1] === 'editor:recorder-launcher')
      .at(-1)[2];
    const closeCount = origin.closeCount;
    const secondOpen = await fixture.ipcHandlers.get('editor:open-recorder')({ sender: origin.webContents });
    const secondContext = fixture.calls
      .filter((call) => call[0] === 'hud-send' && call[1] === 'editor:recorder-launcher')
      .at(-1)[2];

    assert.equal(firstOpen, true);
    assert.equal(secondOpen, true);
    assert.equal(secondContext.requestId, firstContext.requestId);
    assert.equal(origin.closeCount, closeCount);
    assert.throws(
      () =>
        fixture.ipcHandlers.get('editor:open')({ sender: origin.webContents }, projectId, { disposition: 'invalid' }),
      /invalide/,
    );

    assert.equal(
      fixture.ipcListeners.get('editor:recorder-active')({ sender: fixture.hudWindow.webContents }, true),
      true,
    );
    const foreign = fakeWindow(fixture.calls);
    assert.equal(fixture.ipcListeners.get('editor:recorder-active')({ sender: foreign.webContents }, false), false);
    assert.equal(await fixture.ipcHandlers.get('editor:open-recorder')({ sender: origin.webContents }), false);
  } finally {
    fixture.restore();
  }
});

test('global showHud keeps every editor session alive', async () => {
  const fixture = createRecorderFixture();
  try {
    const firstOpening = fixture.manager.open(projectId);
    const first = await readyEditor(fixture, firstOpening);
    const secondProjectId = '33333333-3333-4333-8333-333333333333';
    const secondOpening = fixture.ipcHandlers.get('editor:open')({ sender: first.webContents }, secondProjectId, {
      disposition: 'new-window',
    });
    const second = await readyEditor(fixture, secondOpening);

    assert.equal(fixture.manager.showHud(), true);
    assert.equal(first.closeCount, 0);
    assert.equal(second.closeCount, 0);
    assert.equal(fixture.manager.windows().length, 2);
    assert.equal(fixture.hudWindow.isVisible(), true);
  } finally {
    fixture.restore();
  }
});

test('closing a recorder origin while active blocks another editor from launching a recorder', async () => {
  const fixture = createRecorderFixture();
  try {
    const firstOpening = fixture.manager.open(projectId);
    const first = await readyEditor(fixture, firstOpening);
    const secondProjectId = '44444444-4444-4444-8444-444444444444';
    const secondOpening = fixture.ipcHandlers.get('editor:open')({ sender: first.webContents }, secondProjectId, {
      disposition: 'new-window',
    });
    const second = await readyEditor(fixture, secondOpening);

    assert.equal(await fixture.ipcHandlers.get('editor:open-recorder')({ sender: first.webContents }), true);
    assert.equal(
      fixture.ipcListeners.get('editor:recorder-active')({ sender: fixture.hudWindow.webContents }, true),
      true,
    );
    first.destroy();

    assert.equal(await fixture.ipcHandlers.get('editor:open-recorder')({ sender: second.webContents }), false);
  } finally {
    fixture.restore();
  }
});

test('dismissing a recorder whose origin is gone leaves the HUD visible', async () => {
  const fixture = createRecorderFixture();
  try {
    const opening = fixture.manager.open(projectId);
    const origin = await readyEditor(fixture, opening);
    await fixture.ipcHandlers.get('editor:open-recorder')({ sender: origin.webContents });
    origin.destroy();
    const hiddenCount = fixture.calls.filter((call) => call[0] === 'hud-visible' && call[1] === false).length;

    assert.equal(
      await fixture.ipcHandlers.get('editor:dismiss-recorder')({ sender: fixture.hudWindow.webContents }),
      false,
    );
    assert.equal(fixture.hudWindow.isVisible(), true);
    assert.equal(fixture.calls.filter((call) => call[0] === 'hud-visible' && call[1] === false).length, hiddenCount);
  } finally {
    fixture.restore();
  }
});

test('concurrent new-window opens replace the first presentation request', async () => {
  const fixture = createRecorderFixture();
  try {
    const firstProjectId = '55555555-5555-4555-8555-555555555555';
    const secondProjectId = '66666666-6666-4666-8666-666666666666';
    const open = fixture.ipcHandlers.get('editor:open');
    const firstOpening = open({ sender: fixture.hudWindow.webContents }, firstProjectId, {
      disposition: 'new-window',
    });
    const first = fixture.windows[0];
    first.showCount = 0;
    const firstShow = first.show;
    first.show = () => {
      first.showCount += 1;
      firstShow();
    };

    const secondOpening = open({ sender: fixture.hudWindow.webContents }, secondProjectId, {
      disposition: 'new-window',
    });
    const second = fixture.windows[1];
    second.showCount = 0;
    const secondShow = second.show;
    second.show = () => {
      second.showCount += 1;
      secondShow();
    };
    assert.notEqual(first, second);
    await assert.rejects(firstOpening, /remplacée/);

    fixture.ipcListeners.get('editor:loading-stage')({ sender: first.webContents }, 'loadingTimeline');
    assert.equal(fixture.ipcListeners.get('editor:ready')({ sender: first.webContents }), false);
    assert.equal(first.showCount, 0);

    fixture.ipcListeners.get('editor:ready')({ sender: second.webContents });
    await secondOpening;
    assert.equal(first.showCount, 0);
    assert.equal(second.showCount, 1);
    assert.equal(fixture.manager.window(), second);
  } finally {
    fixture.restore();
  }
});
