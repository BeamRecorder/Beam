const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

function createOverlayHarness(options = {}) {
  const calls = [];
  const listeners = new Map();
  let destroyed = false;
  const window = {
    options: null,
    webContents: {
      send: (...args) => calls.push(['send', ...args]),
      on: (event, callback) => listeners.set(`contents:${event}`, callback),
    },
    once: (event, listener) => listeners.set(event, listener),
    on: (event, listener) => listeners.set(event, listener),
    emit: (event, ...args) => listeners.get(event)?.(...args),
    isDestroyed: () => destroyed,
    setContentProtection: (value) => calls.push(['contentProtection', value]),
    setVisibleOnAllWorkspaces: (...args) => calls.push(['workspaces', ...args]),
    setAlwaysOnTop: (...args) => calls.push(['alwaysOnTop', ...args]),
    setBounds: (bounds) => calls.push(['bounds', bounds]),
    setParentWindow: (parent) => calls.push(['parent', parent]),
    setIgnoreMouseEvents: (value) => calls.push(['mouse', value]),
    show: () => calls.push(['show']),
    showInactive: () => calls.push(['showInactive']),
    focus: () => calls.push(['focus']),
    moveTop: () => calls.push(['moveTop']),
    hide: () => calls.push(['hide']),
    destroy: () => {
      destroyed = true;
      listeners.get('closed')?.();
    },
    loadURL: (url) => {
      calls.push(['loadURL', url]);
      return Promise.resolve();
    },
    loadFile: (file) => {
      calls.push(['loadFile', file]);
      return Promise.resolve();
    },
  };
  const electron = {
    BrowserWindow: class {
      constructor(options) {
        window.options = options;
        return window;
      }
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../apps/desktop/electron/screen-region-overlay.cjs');
    delete require.cache[modulePath];
    const { createScreenRegionOverlayWindow } = require('../apps/desktop/electron/screen-region-overlay.cjs');
    return {
      overlay: createScreenRegionOverlayWindow({
        applicationRoot: '/app',
        isPackaged: false,
        platform: 'linux',
        ...(options.platform === 'win32'
          ? {
              selectionPreview: {
                prepare: async () => ({ preview: 'data:image/png;base64,desktop' }),
                cancel: async () => {},
              },
            }
          : {}),
        ...options,
      }),
      calls,
      window,
    };
  } finally {
    Module._load = originalLoad;
  }
}

test('failed selector loading releases its prepared monitor and disposes the native window', async () => {
  let cancelled = 0;
  const { overlay, window } = createOverlayHarness({
    selectionPreview: {
      prepare: async () => ({}),
      cancel: async () => cancelled++,
    },
  });
  window.loadURL = () => Promise.reject(new Error('selector load failed'));
  await assert.rejects(overlay.select({ bounds: { x: 0, y: 0, width: 1000, height: 800 } }), /selector load failed/);
  assert.equal(window.isDestroyed(), true);
  assert.equal(overlay.isSelecting(), false);
  assert.equal(cancelled, 1);
});
test('Start/Stop is delivered only to the ready selector and stops being intercepted after selection', async () => {
  const { overlay, window, calls } = createOverlayHarness();
  const selection = overlay.select({ bounds: { x: 0, y: 0, width: 1280, height: 720 } });
  assert.equal(overlay.handleShortcut('hud.startStopRecording'), false);
  window.emit('ready-to-show');
  overlay.markRendererReady(window.webContents);
  assert.equal(overlay.handleShortcut('editor.play'), false);
  assert.equal(overlay.handleShortcut('hud.startStopRecording'), true);
  assert.deepEqual(calls.at(-1), ['send', 'preferences:shortcut', 'hud.startStopRecording']);
  overlay.cancel();
  assert.equal(await selection, null);
  assert.equal(overlay.handleShortcut('hud.startStopRecording'), false);
});
test('loads the lightweight region entry while the native monitor preview is still preparing', async () => {
  let finish;
  const bounds = { x: 0, y: 0, width: 1000, height: 800 };
  const selectedBounds = { ...bounds, x: 1000 };
  const { overlay, window, calls } = createOverlayHarness({
    selectionPreview: {
      prepare: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      cancel: async () => {},
    },
  });
  const selection = overlay.select({ bounds });
  assert.deepEqual(
    calls.find(([name]) => name === 'loadURL'),
    ['loadURL', 'http://localhost:6500/html/screen-region.html'],
  );
  assert.equal(window.options.webPreferences.backgroundThrottling, false);
  overlay.markRendererReady(window.webContents);
  window.emit('ready-to-show');
  assert.equal(
    calls.some(([name]) => name === 'show' || name === 'send'),
    false,
  );
  finish({ bounds: selectedBounds, preview: 'data:image/png;base64,preview' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    calls.find(([name]) => name === 'bounds'),
    ['bounds', selectedBounds],
  );
  assert.equal(calls.filter(([name]) => name === 'show').length, 1);
  overlay.confirm({ x: 0, y: 0, width: 1, height: 1 });
  assert.deepEqual((await selection).bounds, selectedBounds);
});
test('preview completion still waits for a loaded and subscribed renderer', async () => {
  const { overlay, window, calls } = createOverlayHarness({
    isPackaged: true,
    selectionPreview: { prepare: async () => ({}), cancel: async () => {} },
  });
  const selection = overlay.select({
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    calls.find(([name]) => name === 'loadFile'),
    ['loadFile', '/app/dist/html/screen-region.html'],
  );
  overlay.markRendererReady(window.webContents);
  assert.equal(
    calls.some(([name]) => name === 'show'),
    false,
  );
  window.emit('ready-to-show');
  assert.equal(calls.filter(([name]) => name === 'show').length, 1);
  overlay.cancel();
  assert.equal(await selection, null);
});
test('cancelling during native preparation leaves a warmed selector hidden', async () => {
  let finish;
  let cancelled = 0;
  const { overlay, window, calls } = createOverlayHarness({
    selectionPreview: {
      prepare: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      cancel: async () => cancelled++,
    },
  });
  const selection = overlay.select({
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
  });
  overlay.cancel();
  overlay.markRendererReady(window.webContents);
  window.emit('ready-to-show');
  finish({});
  assert.equal(await selection, null);
  assert.equal(cancelled, 1);
  assert.equal(
    calls.some(([name]) => name === 'show'),
    false,
  );
});
test('renderer loss and unresponsiveness reject selection instead of leaving the HUD waiting', async () => {
  for (const event of ['contents:render-process-gone', 'unresponsive']) {
    const { overlay, window } = createOverlayHarness();
    const result = overlay.select({
      bounds: { x: 0, y: 0, width: 1000, height: 800 },
    });
    window.emit(event);
    await assert.rejects(result, /renderer exited|unresponsive/);
    assert.equal(overlay.isSelecting(), false);
    assert.equal(window.isDestroyed(), true);
  }
});
test('a second selection cannot cancel or replace an active monitor authorization', async () => {
  const { overlay } = createOverlayHarness();
  const options = { bounds: { x: 0, y: 0, width: 1000, height: 800 } };
  const original = overlay.select(options);
  await assert.rejects(overlay.select(options), /already open/);
  assert.equal(overlay.isSelecting(), true);
  overlay.cancel();
  assert.equal(await original, null);
});

test('Linux region construction uses exact X11 display bounds', async () => {
  const { overlay, window, calls } = createOverlayHarness();
  const bounds = { x: 0, y: 0, width: 1920, height: 1080 };
  const selection = overlay.select({ bounds });
  assert.equal(window.options.fullscreen, undefined);
  assert.equal(window.options.type, 'dock');
  assert.equal(window.options.width, bounds.width);
  assert.equal(window.options.height, bounds.height);
  window.emit('ready-to-show');
  assert.equal(
    calls.some(([name]) => name === 'show'),
    false,
  );
  assert.equal(overlay.markRendererReady({}), false);
  assert.equal(
    calls.some(([name]) => name === 'send'),
    false,
  );
  assert.equal(overlay.markRendererReady(window.webContents), true);
  assert.equal(
    calls.some(([name]) => name === 'show'),
    true,
  );
  overlay.cancel();
  assert.equal(await selection, null);
});

for (const platform of ['darwin', 'win32']) {
  test(`${platform} region selection keeps its native window type and offset display bounds`, async () => {
    const { overlay, window, calls } = createOverlayHarness({ platform });
    const bounds = { x: -1920, y: -200, width: 1920, height: 1080 };
    const selection = overlay.select({ bounds });
    assert.equal(window.options.type, undefined);
    for (const property of ['x', 'y', 'width', 'height']) assert.equal(window.options[property], bounds[property]);
    window.emit('ready-to-show');
    overlay.markRendererReady(window.webContents);
    await new Promise((resolve) => setImmediate(resolve));
    if (platform === 'win32') {
      const configuration = calls.find(
        ([name, channel]) => name === 'send' && channel === 'screen-region:configure',
      )[2];
      overlay.markPreviewReady(window.webContents, configuration.previewId, true);
    }
    overlay.confirm({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    assert.deepEqual(await selection, { bounds, region: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } });
    overlay.destroy();
  });
}

test('renderer readiness before native readiness does not show an unpainted overlay', async () => {
  const { overlay, window, calls } = createOverlayHarness();
  assert.equal(overlay.markRendererReady(window.webContents), false);
  const selection = overlay.select({
    bounds: { x: 0, y: 0, width: 1280, height: 800 },
  });
  overlay.markRendererReady(window.webContents);
  assert.equal(
    calls.some(([name]) => name === 'show'),
    false,
  );
  window.emit('ready-to-show');
  assert.equal(
    calls.some(([name]) => name === 'show'),
    true,
  );
  overlay.cancel();
  assert.equal(await selection, null);
});

test('defers screen overlay presentation until the native window is ready', async () => {
  const { overlay, calls, window } = createOverlayHarness();
  const selection = overlay.select({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    context: 'quick-snip',
    region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  });

  assert.equal(
    calls.some((call) => call[0] === 'show'),
    false,
  );
  assert.equal(
    calls.some((call) => call[0] === 'focus'),
    false,
  );
  assert.equal(
    calls.some((call) => call[0] === 'send'),
    false,
  );

  overlay.markRendererReady(window.webContents);
  window.emit('ready-to-show');

  assert.equal(
    calls.some((call) => call[0] === 'show'),
    true,
  );
  assert.equal(
    calls.some((call) => call[0] === 'focus'),
    true,
  );
  assert.equal(
    calls.some((call) => call[0] === 'send' && call[1] === 'screen-region:configure'),
    true,
  );
  overlay.cancel();
  assert.equal(await selection, null);
});

test('stays hidden when a pending selection is canceled before native readiness', async () => {
  const { overlay, calls, window } = createOverlayHarness();
  const selection = overlay.select({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  });

  overlay.cancel();
  overlay.markRendererReady(window.webContents);
  window.emit('ready-to-show');

  assert.equal(
    calls.some((call) => call[0] === 'show'),
    false,
  );
  assert.equal(
    calls.some((call) => call[0] === 'focus'),
    false,
  );
  assert.equal(
    calls.some((call) => call[0] === 'send'),
    false,
  );
  assert.equal(await selection, null);
});

test('stays hidden when the overlay is hidden before native readiness', async () => {
  const { overlay, calls, window } = createOverlayHarness();
  const selection = overlay.select({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  });

  overlay.hide();
  overlay.markRendererReady(window.webContents);
  window.emit('ready-to-show');

  assert.equal(
    calls.some((call) => call[0] === 'show'),
    false,
  );
  assert.equal(
    calls.some((call) => call[0] === 'focus'),
    false,
  );
  assert.equal(
    calls.some((call) => call[0] === 'send'),
    false,
  );
  overlay.cancel();
  assert.equal(await selection, null);
});

test('restores the noninteractive recording overlay with showInactive', () => {
  const { overlay, calls, window } = createOverlayHarness();
  overlay.show({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  });

  overlay.markMarkerReady(window.webContents);

  assert.equal(
    calls.some((call) => call[0] === 'showInactive'),
    true,
  );
  assert.equal(
    calls.some((call) => call[0] === 'show'),
    false,
  );
  assert.equal(
    calls.some((call) => call[0] === 'focus'),
    false,
  );
  assert.equal(
    calls.some((call) => call[0] === 'send' && call[1] === 'screen-region:configure'),
    false,
  );
  overlay.hide();
});

test('cleans a failed region selection so a later selection can complete', async () => {
  const calls = [];
  const listeners = new Map();
  let destroyed = false;
  const parentWindow = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 2048, y: 120, width: 352, height: 512 }),
  };
  const window = {
    webContents: {
      send: (...args) => calls.push(['send', ...args]),
      on: () => {},
    },
    once: (event, listener) => listeners.set(event, listener),
    on: (event, listener) => listeners.set(event, listener),
    isDestroyed: () => destroyed,
    setContentProtection: (value) => calls.push(['contentProtection', value]),
    setBounds: (bounds) => calls.push(['bounds', bounds]),
    setParentWindow: (parent) => calls.push(['parent', parent]),
    setIgnoreMouseEvents: (value) => calls.push(['mouse', value]),
    show: () => calls.push(['show']),
    showInactive: () => calls.push(['showInactive']),
    focus: () => calls.push(['focus']),
    moveTop: () => calls.push(['moveTop']),
    hide: () => calls.push(['hide']),
    destroy: () => {
      destroyed = true;
      listeners.get('closed')?.();
    },
    loadURL: () => Promise.resolve(),
    loadFile: () => Promise.resolve(),
  };
  const electron = {
    BrowserWindow: class {
      constructor() {
        return window;
      }
    },
    screen: {
      getDisplayMatching: (bounds) => {
        calls.push(['getDisplayMatching', bounds]);
        return { bounds: { x: 1920, y: 0, width: 2560, height: 1440 } };
      },
      getPrimaryDisplay: () => ({
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      }),
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../apps/desktop/electron/screen-region-overlay.cjs');
    delete require.cache[modulePath];
    const { createScreenRegionOverlayWindow } = require('../apps/desktop/electron/screen-region-overlay.cjs');
    const overlay = createScreenRegionOverlayWindow({
      applicationRoot: '/app',
      isPackaged: false,
      platform: 'linux',
      screen: electron.screen,
    });

    await assert.rejects(
      () => overlay.select({ bounds: { x: 0, y: 0, width: 0, height: 1080 }, region: null }, parentWindow),
      /Screen overlay size is invalid/,
    );

    const bounds = { x: 0, y: 0, width: 1920, height: 1080 };
    const nextSelection = overlay.select({ bounds, region: null }, parentWindow);
    const selectedRegion = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
    overlay.confirm(selectedRegion);
    assert.deepEqual(await nextSelection, { bounds, region: selectedRegion });
    assert.deepEqual(
      calls.filter((call) => call[0] === 'parent').map((call) => call[1]),
      [null, null],
    );
  } finally {
    Module._load = originalLoad;
  }
});

test('resolves Linux selection bounds from the parent display and falls back to the primary display', async () => {
  const calls = [];
  const listeners = new Map();
  let destroyed = false;
  const parentWindow = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 2048, y: 120, width: 352, height: 512 }),
  };
  const window = {
    webContents: {
      send: (...args) => calls.push(['send', ...args]),
      on: () => {},
    },
    once: (event, listener) => listeners.set(event, listener),
    on: (event, listener) => listeners.set(event, listener),
    isDestroyed: () => destroyed,
    setContentProtection: (value) => calls.push(['contentProtection', value]),
    setBounds: (bounds) => calls.push(['bounds', bounds]),
    setParentWindow: (parent) => calls.push(['parent', parent]),
    setIgnoreMouseEvents: (value) => calls.push(['mouse', value]),
    show: () => calls.push(['show']),
    showInactive: () => calls.push(['showInactive']),
    focus: () => calls.push(['focus']),
    moveTop: () => calls.push(['moveTop']),
    hide: () => calls.push(['hide']),
    destroy: () => {
      destroyed = true;
      listeners.get('closed')?.();
    },
    loadURL: () => Promise.resolve(),
    loadFile: () => Promise.resolve(),
  };
  const matchingBounds = { x: 1920, y: 0, width: 2560, height: 1440 };
  const primaryBounds = { x: 0, y: 0, width: 1920, height: 1080 };
  const screen = {
    getDisplayMatching: (bounds) => {
      calls.push(['getDisplayMatching', bounds]);
      return { bounds: matchingBounds };
    },
    getPrimaryDisplay: () => ({ bounds: primaryBounds }),
  };
  const electron = {
    BrowserWindow: class {
      constructor() {
        return window;
      }
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../apps/desktop/electron/screen-region-overlay.cjs');
    delete require.cache[modulePath];
    const { createScreenRegionOverlayWindow } = require('../apps/desktop/electron/screen-region-overlay.cjs');
    const overlay = createScreenRegionOverlayWindow({
      applicationRoot: '/app',
      isPackaged: false,
      platform: 'linux',
      screen,
    });

    const parentSelection = overlay.select({ region: null }, parentWindow);
    const selectedRegion = { x: 0.2, y: 0.25, width: 0.4, height: 0.3 };
    overlay.confirm(selectedRegion);
    assert.deepEqual(await parentSelection, {
      bounds: matchingBounds,
      region: selectedRegion,
    });
    assert.deepEqual(
      calls.find((call) => call[0] === 'getDisplayMatching'),
      ['getDisplayMatching', parentWindow.getBounds()],
    );

    const primarySelection = overlay.select({ region: null });
    overlay.cancel();
    assert.equal(await primarySelection, null);
    assert.deepEqual(calls.filter((call) => call[0] === 'bounds').at(-1), ['bounds', primaryBounds]);
    assert.deepEqual(calls.filter((call) => call[0] === 'parent').at(-1), ['parent', null]);
  } finally {
    Module._load = originalLoad;
  }
});

test('updates the live overlay payload and clamps the current selection before confirmCurrent resolves it', async () => {
  const { overlay, calls, window } = createOverlayHarness();
  const bounds = { x: 0, y: 0, width: 1920, height: 1080 };
  const selection = overlay.select({
    bounds,
    context: 'quick-snip',
    region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  });
  overlay.markRendererReady(window.webContents);
  window.emit('ready-to-show');
  calls.length = 0;
  let liveRegion = null;
  overlay.setRegionChangeListener((region, displayBounds) => {
    liveRegion = { region, displayBounds };
  });

  assert.equal(overlay.update({ x: -0.25, y: 0.75, width: 0.8, height: 0.8 }), true);
  assert.deepEqual(liveRegion, {
    displayBounds: bounds,
    region: { x: 0, y: 0.75, width: 0.8, height: 0.25 },
  });
  assert.equal(
    calls.some((call) => call[0] === 'send'),
    false,
  );
  assert.equal(overlay.confirmCurrent(), true);
  assert.deepEqual(await selection, {
    bounds,
    region: { x: 0, y: 0.75, width: 0.8, height: 0.25 },
  });
});

test('exposes the live native overlay window for an owned Crop Bar', async () => {
  const { overlay, window } = createOverlayHarness();
  const selection = overlay.select({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    context: 'quick-snip',
    region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  });

  assert.equal(overlay.nativeWindow(), window);
  overlay.cancel();
  assert.equal(await selection, null);
  overlay.destroy();
  assert.equal(overlay.nativeWindow(), null);
});

test('rejects zero, NaN, and invalid out-of-range updates without resolving selection', async () => {
  const { overlay } = createOverlayHarness();
  const selection = overlay.select({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  });
  let resolved = false;
  selection.then(() => {
    resolved = true;
  });

  const invalidRegions = [
    { x: 0.1, y: 0.2, width: 0, height: 0.4 },
    { x: 0.1, y: 0.2, width: 0.5, height: 0 },
    { x: Number.NaN, y: 0.2, width: 0.5, height: 0.4 },
    { x: 1.1, y: 0.2, width: 0.5, height: 0.4 },
    { x: 0.1, y: 1.1, width: 0.5, height: 0.4 },
    { x: 0.1, y: 0.2, width: -0.1, height: 0.4 },
  ];
  for (const region of invalidRegions) assert.equal(overlay.update(region), false);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolved, false);
  overlay.cancel();
  assert.equal(await selection, null);
});

test('cancels an active selection, detaches its parent, and ignores stale updates', async () => {
  const { overlay, calls, window } = createOverlayHarness();
  const parentWindow = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 10, y: 20, width: 352, height: 512 }),
  };
  const selection = overlay.select(
    {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      context: 'quick-snip',
      region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
    },
    parentWindow,
  );

  overlay.markRendererReady(window.webContents);
  window.emit('ready-to-show');
  overlay.cancel();

  assert.equal(await selection, null);
  assert.equal(overlay.update({ x: 0.2, y: 0.2, width: 0.5, height: 0.4 }), false);
  assert.deepEqual(calls.filter((call) => call[0] === 'parent').at(-1), ['parent', null]);
  assert.equal(
    calls.some((call) => call[0] === 'hide'),
    true,
  );
});

test('destroy resolves a pending selection and leaves later operations inert', async () => {
  const { overlay } = createOverlayHarness();
  const first = overlay.select({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  });

  overlay.destroy();
  assert.equal(await first, null);
  assert.equal(overlay.update({ x: 0.2, y: 0.2, width: 0.5, height: 0.4 }), false);
});

function createRegionOverlayWindowMock(calls) {
  const listeners = new Map();
  let destroyed = false;
  return {
    webContents: {
      send: (...args) => calls.push(['send', ...args]),
      on: (event, listener) => {
        calls.push(['webContents-on', event]);
        listeners.set(`webContents:${event}`, listener);
      },
    },
    once: (event, listener) => listeners.set(event, listener),
    on: (event, listener) => listeners.set(event, listener),
    emit: (event, ...args) => {
      const listener = listeners.get(event);
      if (!listener) return;
      listeners.delete(event);
      listener(...args);
    },
    isDestroyed: () => destroyed,
    setContentProtection: (value) => calls.push(['contentProtection', value]),
    setVisibleOnAllWorkspaces: (...args) => calls.push(['visibleOnAllWorkspaces', ...args]),
    setAlwaysOnTop: (...args) => calls.push(['alwaysOnTop', ...args]),
    setBounds: (bounds) => calls.push(['bounds', bounds]),
    setParentWindow: (parent) => calls.push(['parent', parent]),
    setIgnoreMouseEvents: (value) => calls.push(['mouse', value]),
    show: () => calls.push(['show']),
    showInactive: () => calls.push(['showInactive']),
    focus: () => calls.push(['focus']),
    moveTop: () => calls.push(['moveTop']),
    hide: () => calls.push(['hide']),
    destroy: () => {
      destroyed = true;
      listeners.get('closed')?.();
    },
    emitBeforeInput: (input) => {
      const event = {
        defaultPrevented: false,
        preventDefault: () => {
          event.defaultPrevented = true;
          calls.push(['preventDefault']);
        },
      };
      listeners.get('webContents:before-input-event')?.(event, input);
      return event;
    },
    loadURL: () => Promise.resolve(),
    loadFile: () => Promise.resolve(),
  };
}

for (const scenario of [
  {
    label: 'Recorder',
    context: 'default',
    drawOnly: false,
    region: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    strips: 4,
  },
  {
    label: 'Quick Snip',
    context: 'quick-snip',
    drawOnly: false,
    region: { x: 0, y: 0, width: 0.5, height: 0.5 },
    strips: 2,
  },
  {
    label: 'Quick Snip drawing',
    context: 'quick-snip',
    drawOnly: true,
    region: { x: 0, y: 0, width: 1, height: 1 },
    strips: 0,
  },
]) {
  test(`Windows ${scenario.label} keeps selection hidden until the desktop snapshot has painted`, async () => {
    const { overlay, window, calls } = createOverlayHarness({ platform: 'win32' });
    const bounds = { x: -1280, y: -100, width: 1280, height: 720 };
    const selection = overlay.select({ bounds, region: null, context: scenario.context, drawOnly: scenario.drawOnly });
    overlay.markRendererReady(window.webContents);
    window.emit('ready-to-show');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(window.options.transparent, false);
    const configuration = calls.find(([name, channel]) => name === 'send' && channel === 'screen-region:configure')[2];
    assert.equal(configuration.preview, 'data:image/png;base64,desktop');
    assert.equal(configuration.context, scenario.context);
    assert.equal(configuration.drawOnly, scenario.drawOnly);
    assert.equal(
      calls.some(([name]) => name === 'show'),
      false,
    );
    assert.equal(overlay.handleShortcut('hud.startStopRecording'), false);
    assert.equal(overlay.markPreviewReady({}, configuration.previewId, true), false);
    assert.equal(overlay.markPreviewReady(window.webContents, configuration.previewId + 1, true), false);
    assert.equal(overlay.markPreviewReady(window.webContents, configuration.previewId, 'true'), false);
    assert.equal(overlay.markPreviewReady(window.webContents, configuration.previewId, true), true);
    assert.equal(overlay.markPreviewReady(window.webContents, configuration.previewId, true), false);
    assert.equal(calls.filter(([name]) => name === 'show').length, 1);
    assert.equal(overlay.handleShortcut('hud.startStopRecording'), true);
    const region = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
    overlay.confirm(region);
    assert.deepEqual(await selection, { bounds, region });
    assert.equal(overlay.markPreviewReady(window.webContents, configuration.previewId, true), false);
    overlay.destroy();
  });

  test(`Windows ${scenario.label} records with ${scenario.strips} opaque strips outside the crop`, () => {
    const windows = [];
    const electron = {
      BrowserWindow: class {
        constructor(options) {
          const calls = [];
          const target = createRegionOverlayWindowMock(calls);
          windows.push({ target, options, calls });
          return target;
        }
      },
    };
    const originalLoad = Module._load;
    Module._load = function load(request, parent, isMain) {
      return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
    };
    try {
      const modulePath = require.resolve('../apps/desktop/electron/screen-region-overlay.cjs');
      delete require.cache[modulePath];
      const { createScreenRegionOverlayWindow } = require(modulePath);
      const overlay = createScreenRegionOverlayWindow({
        applicationRoot: '/app',
        isPackaged: false,
        platform: 'win32',
      });
      const bounds = { x: -1280, y: 0, width: 1280, height: 720 };
      overlay.show({ bounds, region: scenario.region });
      assert.equal(windows.length, scenario.strips);
      for (const { target, options, calls } of windows) {
        assert.equal(options.transparent, false);
        assert.equal(options.focusable, false);
        assert.ok(options.width === 2 || options.height === 2);
        assert.ok(
          options.x + options.width <= bounds.x + scenario.region.x * bounds.width ||
            options.x >= bounds.x + (scenario.region.x + scenario.region.width) * bounds.width ||
            options.y + options.height <= bounds.y + scenario.region.y * bounds.height ||
            options.y >= bounds.y + (scenario.region.y + scenario.region.height) * bounds.height,
        );
        assert.equal(
          calls.some(([name]) => name === 'showInactive' || name === 'contentProtection'),
          false,
        );
        overlay.markMarkerReady(target.webContents);
        assert.equal(
          calls.some(([name]) => name === 'showInactive'),
          true,
        );
      }
      overlay.hide();
    } finally {
      Module._load = originalLoad;
    }
  });
}

test('Windows preview decode failure rejects selection and releases capture without presenting', async () => {
  let cancelled = 0;
  const { overlay, window, calls } = createOverlayHarness({
    platform: 'win32',
    selectionPreview: {
      prepare: async () => ({ preview: 'data:image/png;base64,desktop' }),
      cancel: async () => cancelled++,
    },
  });
  const selection = overlay.select({ bounds: { x: 0, y: 0, width: 800, height: 600 } });
  overlay.markRendererReady(window.webContents);
  window.emit('ready-to-show');
  await new Promise((resolve) => setImmediate(resolve));
  const configuration = calls.find(([name, channel]) => name === 'send' && channel === 'screen-region:configure')[2];
  assert.equal(overlay.markPreviewReady(window.webContents, configuration.previewId, false), true);
  await assert.rejects(selection, /desktop preview could not be displayed/);
  assert.equal(cancelled, 1);
  assert.equal(window.isDestroyed(), true);
  assert.equal(overlay.isSelecting(), false);
  assert.equal(
    calls.some(([name]) => name === 'show'),
    false,
  );
});

test('Windows selection rejects a missing snapshot instead of presenting a black window', async () => {
  let cancelled = 0;
  const { overlay, calls } = createOverlayHarness({
    platform: 'win32',
    selectionPreview: {
      prepare: async () => ({}),
      cancel: async () => cancelled++,
    },
  });
  await assert.rejects(
    overlay.select({ bounds: { x: 0, y: 0, width: 800, height: 600 } }),
    /desktop preview is required/,
  );
  assert.equal(cancelled, 1);
  assert.equal(overlay.isSelecting(), false);
  assert.equal(
    calls.some(([name]) => name === 'show'),
    false,
  );
});

test('cancelled and previous Windows preview acknowledgements cannot present a newer selection', async () => {
  const { overlay, calls, window } = createOverlayHarness({ platform: 'win32' });
  const bounds = { x: 0, y: 0, width: 800, height: 600 };
  const first = overlay.select({ bounds });
  overlay.markRendererReady(window.webContents);
  window.emit('ready-to-show');
  await new Promise((resolve) => setImmediate(resolve));
  const previous = calls.find(([name, channel]) => name === 'send' && channel === 'screen-region:configure')[2];
  overlay.cancel();
  assert.equal(await first, null);
  assert.equal(overlay.markPreviewReady(window.webContents, previous.previewId, true), false);
  const second = overlay.select({ bounds, context: 'quick-snip' });
  await new Promise((resolve) => setImmediate(resolve));
  const current = calls.filter(([name, channel]) => name === 'send' && channel === 'screen-region:configure').at(-1)[2];
  assert.ok(current.previewId > previous.previewId);
  assert.equal(current.preview, 'data:image/png;base64,desktop');
  assert.equal(overlay.markPreviewReady(window.webContents, previous.previewId, true), false);
  assert.equal(
    calls.some(([name]) => name === 'show'),
    false,
  );
  assert.equal(overlay.markPreviewReady(window.webContents, current.previewId, true), true);
  overlay.cancel();
  assert.equal(await second, null);
});

test('Windows preview painting has a deadline even after native and renderer readiness', async (t) => {
  let expire;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    assert.equal(delay, 30_000);
    expire = callback;
    return { unref() {} };
  });
  let cancelled = 0;
  const { overlay, calls, window } = createOverlayHarness({
    platform: 'win32',
    selectionPreview: {
      prepare: async () => ({ preview: 'data:image/png;base64,desktop' }),
      cancel: async () => cancelled++,
    },
  });
  const selection = overlay.select({ bounds: { x: 0, y: 0, width: 800, height: 600 } });
  overlay.markRendererReady(window.webContents);
  window.emit('ready-to-show');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof expire, 'function');
  expire();
  await assert.rejects(selection, /did not become ready within 30 seconds/);
  assert.equal(cancelled, 1);
  assert.equal(window.isDestroyed(), true);
  assert.equal(
    calls.some(([name]) => name === 'show'),
    false,
  );
});

test('keeps an offset macOS display selection interactive across Spaces', async () => {
  const calls = [];
  const window = createRegionOverlayWindowMock(calls);
  const electron = {
    BrowserWindow: class {
      constructor() {
        return window;
      }
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../apps/desktop/electron/screen-region-overlay.cjs');
    delete require.cache[modulePath];
    const { createScreenRegionOverlayWindow } = require('../apps/desktop/electron/screen-region-overlay.cjs');
    const overlay = createScreenRegionOverlayWindow({
      applicationRoot: '/app',
      isPackaged: false,
      platform: 'darwin',
    });
    const bounds = { x: -1728, y: 0, width: 1728, height: 1117 };
    const region = { x: 0.125, y: 0.2, width: 0.5, height: 0.4 };

    const firstSelection = overlay.select({ bounds, region: null });
    overlay.markRendererReady(window.webContents);
    window.emit('ready-to-show');
    assert.deepEqual(
      calls.filter((call) =>
        [
          'contentProtection',
          'visibleOnAllWorkspaces',
          'alwaysOnTop',
          'webContents-on',
          'bounds',
          'mouse',
          'show',
          'focus',
        ].includes(call[0]),
      ),
      [
        ['contentProtection', true],
        ['visibleOnAllWorkspaces', true, { visibleOnFullScreen: true, skipTransformProcessType: true }],
        ['alwaysOnTop', true, 'screen-saver'],
        ['webContents-on', 'before-input-event'],
        ['webContents-on', 'render-process-gone'],
        ['bounds', bounds],
        ['mouse', false],
        ['show'],
        ['focus'],
      ],
    );
    overlay.confirm(region);
    assert.deepEqual(await firstSelection, { bounds, region });

    const secondBounds = { x: 0, y: 0, width: 3024, height: 1964 };
    const secondSelection = overlay.select({ bounds: secondBounds, region });
    overlay.cancel();
    assert.equal(await secondSelection, null);
    assert.deepEqual(calls.filter((call) => call[0] === 'bounds').at(-1), ['bounds', secondBounds]);
    assert.deepEqual(calls.filter((call) => call[0] === 'parent').at(-1), ['parent', null]);
  } finally {
    Module._load = originalLoad;
  }
});

test('uses native Escape handling to cancel a macOS selection', async () => {
  const calls = [];
  const window = createRegionOverlayWindowMock(calls);
  const electron = {
    BrowserWindow: class {
      constructor() {
        return window;
      }
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../apps/desktop/electron/screen-region-overlay.cjs');
    delete require.cache[modulePath];
    const { createScreenRegionOverlayWindow } = require('../apps/desktop/electron/screen-region-overlay.cjs');
    const overlay = createScreenRegionOverlayWindow({
      applicationRoot: '/app',
      isPackaged: false,
      platform: 'darwin',
    });
    const selection = overlay.select({
      bounds: { x: -1728, y: 0, width: 1728, height: 1117 },
      region: null,
    });

    const inputEvent = window.emitBeforeInput({
      type: 'keyDown',
      key: 'Escape',
    });
    assert.equal(inputEvent.defaultPrevented, true);
    assert.deepEqual(await selection, null);
    assert.ok(calls.some((call) => call[0] === 'preventDefault'));
    assert.ok(calls.some((call) => call[0] === 'hide'));
    assert.deepEqual(calls.filter((call) => call[0] === 'parent').at(-1), ['parent', null]);

    // The native listener must only cancel a pending interactive selection.
    const idleInputEvent = window.emitBeforeInput({
      type: 'keyDown',
      key: 'Escape',
    });
    assert.equal(idleInputEvent.defaultPrevented, false);
    assert.equal(calls.filter((call) => call[0] === 'preventDefault').length, 1);
  } finally {
    Module._load = originalLoad;
  }
});
