const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
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

function loadTrayIconPath(platform) {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const originalLoad = Module._load;
  const loadedPaths = [];

  class FakeTray {
    constructor() {}

    setToolTip() {}

    setContextMenu() {}

    on() {}

    isDestroyed() {
      return false;
    }

    destroy() {}
  }

  const electron = {
    Tray: FakeTray,
    Menu: { buildFromTemplate: (template) => template },
    nativeImage: {
      createEmpty: () => ({ isEmpty: () => true }),
      createFromPath: (iconPath) => {
        loadedPaths.push(iconPath);
        return { isEmpty: () => false };
      },
    },
    app: { quit() {} },
    ipcMain: { on() {} },
  };

  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return electron;
    if (request === 'fs') return { existsSync: () => true };
    return originalLoad.call(this, request, parent, isMain);
  };

  const modulePath = require.resolve('../electron/tray/tray-manager.cjs');
  delete require.cache[modulePath];

  try {
    const { createTrayManager } = require(modulePath);
    createTrayManager({
      applicationRoot: '/app',
      getWindow: () => null,
      getController: () => null,
    }).init();
    return loadedPaths[0];
  } finally {
    Module._load = originalLoad;
    Object.defineProperty(process, 'platform', originalPlatform);
    delete require.cache[modulePath];
  }
}

test('uses dedicated tray icons on every platform', () => {
  assert.match(loadTrayIconPath('linux'), /BeamTray\.png$/);
  assert.match(loadTrayIconPath('win32'), /BeamTray\.ico$/);
  assert.match(loadTrayIconPath('darwin'), /BeamTrayTemplate\.png$/);
});

test('the Windows tray ICO contains exact notification-area sizes', () => {
  const icon = fs.readFileSync(path.join(__dirname, '../public/brand/BeamTray.ico'));
  const imageCount = icon.readUInt16LE(4);
  const sizes = Array.from({ length: imageCount }, (_, index) => {
    const entryOffset = 6 + index * 16;
    const width = icon[entryOffset] || 256;
    const height = icon[entryOffset + 1] || 256;
    return [width, height];
  });

  assert.deepEqual(sizes, [
    [16, 16],
    [20, 20],
    [24, 24],
    [32, 32],
    [40, 40],
    [48, 48],
    [64, 64],
    [128, 128],
    [256, 256],
  ]);
});
