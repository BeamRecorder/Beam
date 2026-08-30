const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

test('cleans a failed region selection so a later selection can complete', async () => {
  const calls = [];
  const listeners = new Map();
  let destroyed = false;
  const parentWindow = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 2048, y: 120, width: 352, height: 512 }),
  };
  const window = {
    webContents: { send: (...args) => calls.push(['send', ...args]) },
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
    loadURL: () => undefined,
    loadFile: () => undefined,
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
      getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../electron/screen-region-overlay.cjs');
    delete require.cache[modulePath];
    const { createScreenRegionOverlayWindow } = require('../electron/screen-region-overlay.cjs');
    const overlay = createScreenRegionOverlayWindow({
      applicationRoot: '/app',
      isPackaged: false,
      platform: 'linux',
      screen: electron.screen,
    });

    assert.throws(
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
      [parentWindow, null],
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
    webContents: { send: (...args) => calls.push(['send', ...args]) },
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
    loadURL: () => undefined,
    loadFile: () => undefined,
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
    const modulePath = require.resolve('../electron/screen-region-overlay.cjs');
    delete require.cache[modulePath];
    const { createScreenRegionOverlayWindow } = require('../electron/screen-region-overlay.cjs');
    const overlay = createScreenRegionOverlayWindow({
      applicationRoot: '/app',
      isPackaged: false,
      platform: 'linux',
      screen,
    });

    const parentSelection = overlay.select({ region: null }, parentWindow);
    const selectedRegion = { x: 0.2, y: 0.25, width: 0.4, height: 0.3 };
    overlay.confirm(selectedRegion);
    assert.deepEqual(await parentSelection, { bounds: matchingBounds, region: selectedRegion });
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

function createRegionOverlayWindowMock(calls) {
  const listeners = new Map();
  let destroyed = false;
  return {
    webContents: { send: (...args) => calls.push(['send', ...args]) },
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
    loadURL: () => undefined,
    loadFile: () => undefined,
  };
}

test('keeps interactive Windows region selection available on Windows 10', async () => {
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
    const modulePath = require.resolve('../electron/screen-region-overlay.cjs');
    delete require.cache[modulePath];
    const { createScreenRegionOverlayWindow } = require('../electron/screen-region-overlay.cjs');
    const overlay = createScreenRegionOverlayWindow({
      applicationRoot: '/app',
      isPackaged: false,
      platform: 'win32',
      platformRelease: '10.0.19045',
    });
    const bounds = { x: -1280, y: 0, width: 1280, height: 720 };
    const selection = overlay.select({ bounds, region: null });
    const region = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };

    assert.deepEqual(await (overlay.confirm(region), selection), { bounds, region });
    assert.deepEqual(
      calls.filter((call) => ['bounds', 'mouse', 'show', 'focus'].includes(call[0])),
      [['bounds', bounds], ['mouse', false], ['show'], ['focus']],
    );
  } finally {
    Module._load = originalLoad;
  }
});

test('suppresses the recording region marker on Windows 10 build 19045', () => {
  const calls = [];
  let constructed = 0;
  const window = createRegionOverlayWindowMock(calls);
  const electron = {
    BrowserWindow: class {
      constructor() {
        constructed += 1;
        return window;
      }
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../electron/screen-region-overlay.cjs');
    delete require.cache[modulePath];
    const { createScreenRegionOverlayWindow } = require('../electron/screen-region-overlay.cjs');
    const overlay = createScreenRegionOverlayWindow({
      applicationRoot: '/app',
      isPackaged: false,
      platform: 'win32',
      platformRelease: '10.0.19045',
    });
    overlay.show({ bounds: { x: -1280, y: 0, width: 1280, height: 720 }, region: { x: 0, y: 0, width: 1, height: 1 } });

    assert.equal(constructed, 0);
    assert.deepEqual(calls, []);
  } finally {
    Module._load = originalLoad;
  }
});

test('shows the recording region marker on Windows 11 build 22000 and newer', () => {
  const calls = [];
  let constructed = 0;
  const window = createRegionOverlayWindowMock(calls);
  const electron = {
    BrowserWindow: class {
      constructor() {
        constructed += 1;
        return window;
      }
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../electron/screen-region-overlay.cjs');
    delete require.cache[modulePath];
    const { createScreenRegionOverlayWindow } = require('../electron/screen-region-overlay.cjs');
    const overlay = createScreenRegionOverlayWindow({
      applicationRoot: '/app',
      isPackaged: false,
      platform: 'win32',
      platformRelease: '10.0.22000',
    });
    const bounds = { x: -1280, y: 0, width: 1280, height: 720 };
    overlay.show({ bounds, region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 } });

    assert.equal(constructed, 1);
    assert.deepEqual(
      calls.filter((call) => ['contentProtection', 'bounds', 'mouse', 'showInactive', 'moveTop'].includes(call[0])),
      [['contentProtection', true], ['bounds', bounds], ['mouse', true], ['showInactive'], ['moveTop']],
    );
  } finally {
    Module._load = originalLoad;
  }
});
