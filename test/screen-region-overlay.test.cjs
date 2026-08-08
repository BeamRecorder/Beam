const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

test('cleans a failed region selection so a later selection can complete', async () => {
  const calls = [];
  const listeners = new Map();
  let destroyed = false;
  const window = {
    webContents: { send: (...args) => calls.push(['send', ...args]) },
    once: (event, listener) => listeners.set(event, listener),
    on: (event, listener) => listeners.set(event, listener),
    isDestroyed: () => destroyed,
    setContentProtection: (value) => calls.push(['contentProtection', value]),
    setBounds: (bounds) => calls.push(['bounds', bounds]),
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
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { createScreenRegionOverlayWindow } = require('../electron/screen-region-overlay.cjs');
    const overlay = createScreenRegionOverlayWindow({ applicationRoot: '/app', isPackaged: false });

    assert.throws(
      () => overlay.select({ bounds: { x: 0, y: 0, width: 0, height: 1080 }, region: null }),
      /Screen overlay size is invalid/,
    );
    assert.ok(calls.some((call) => call[0] === 'hide'));

    const nextSelection = overlay.select({ bounds: { x: 0, y: 0, width: 1920, height: 1080 }, region: null });
    const selectedRegion = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
    overlay.confirm(selectedRegion);
    assert.deepEqual(await nextSelection, selectedRegion);
  } finally {
    Module._load = originalLoad;
  }
});
