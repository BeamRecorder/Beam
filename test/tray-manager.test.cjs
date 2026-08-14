const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

test('adds a tray stop action while recording and forwards it to the HUD window', () => {
  const calls = [];
  let latestTemplate;
  let ipcListener;
  const window = {
    isDestroyed: () => false,
    webContents: { send: (...args) => calls.push(args) },
  };
  class FakeTray {
    constructor() {
      this.destroyed = false;
    }
    setToolTip(value) {
      calls.push(['tooltip', value]);
    }
    setContextMenu(menu) {
      latestTemplate = menu;
    }
    on() {}
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const electron = {
    Tray: FakeTray,
    Menu: { buildFromTemplate: (template) => template },
    nativeImage: {
      createEmpty: () => ({ isEmpty: () => true }),
      createFromPath: () => ({ isEmpty: () => false }),
    },
    app: { quit: () => calls.push(['quit']) },
    ipcMain: { on: (_channel, listener) => (ipcListener = listener) },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { createTrayManager } = require('../electron/tray/tray-manager.cjs');
    const manager = createTrayManager({
      applicationRoot: '/app',
      getWindow: () => window,
      getController: () => null,
    });
    manager.init();
    manager.updateMenu({ recording: true });

    const stopItem = latestTemplate.find((item) => item.label === 'Stop recording');
    assert.ok(stopItem);
    stopItem.click();
    assert.deepEqual(calls.at(-1), ['tray:stop-recording']);
    assert.equal(typeof ipcListener, 'function');
  } finally {
    Module._load = originalLoad;
  }
});
