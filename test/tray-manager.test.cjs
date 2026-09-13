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

test('keeps Quick Snip first, updates its state label, invokes its callback and locks it during Beam recording', () => {
  const calls = [];
  let latestTemplate;
  class FakeTray {
    setToolTip() {}
    setContextMenu(menu) {
      latestTemplate = menu;
    }
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
      createFromPath: () => ({ isEmpty: () => false }),
    },
    app: { quit() {} },
    ipcMain: { on() {} },
  };
  const originalLoad = Module._load;
  const modulePath = require.resolve('../electron/tray/tray-manager.cjs');
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[modulePath];

  try {
    const { createTrayManager } = require(modulePath);
    const manager = createTrayManager({
      applicationRoot: '/app',
      getWindow: () => null,
      getController: () => null,
      onQuickSnip: () => calls.push('quick-snip'),
    });
    manager.init();

    assert.equal(latestTemplate[0].label, 'Quick Snip');
    assert.equal(latestTemplate[0].enabled, true);
    latestTemplate[0].click();
    assert.deepEqual(calls, ['quick-snip']);

    manager.setQuickSnipState('selecting');
    assert.equal(latestTemplate[0].label, 'Start Quick Snip');
    manager.setQuickSnipState('recording');
    assert.equal(latestTemplate[0].label, 'Stop Quick Snip');

    manager.updateMenu({ recording: true });
    assert.equal(latestTemplate[0].enabled, false);
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
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

test('normalizes the Linux tray icon to 24x24 when nativeImage resize is available', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const originalLoad = Module._load;
  const modulePath = require.resolve('../electron/tray/tray-manager.cjs');
  let resizeOptions;
  let trayIcon;
  const icon = {
    isEmpty: () => false,
    resize: (options) => {
      resizeOptions = options;
      return { isEmpty: () => false, resized: true };
    },
  };
  class FakeTray {
    constructor(value) {
      trayIcon = value;
    }
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
      createFromPath: () => icon,
    },
    app: { quit() {} },
    ipcMain: { on() {} },
  };
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return electron;
    if (request === 'fs') return { existsSync: () => true };
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[modulePath];

  try {
    const { createTrayManager } = require(modulePath);
    createTrayManager({ applicationRoot: '/app', getWindow: () => null, getController: () => null }).init();
    assert.equal(resizeOptions.width, 24);
    assert.equal(resizeOptions.height, 24);
    assert.equal(trayIcon.resized, true);
  } finally {
    Module._load = originalLoad;
    Object.defineProperty(process, 'platform', originalPlatform);
    delete require.cache[modulePath];
  }
});

test('rejects an absent or unreadable Linux tray icon before creating an empty Tray', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const originalLoad = Module._load;
  const modulePath = require.resolve('../electron/tray/tray-manager.cjs');
  let trayCreated = false;
  class FakeTray {
    constructor() {
      trayCreated = true;
    }
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
      createFromPath: () => ({ isEmpty: () => true }),
    },
    app: { quit() {} },
    ipcMain: { on() {} },
  };
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return electron;
    if (request === 'fs') return { existsSync: () => true };
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[modulePath];

  try {
    const { createTrayManager } = require(modulePath);
    const manager = createTrayManager({ applicationRoot: '/app', getWindow: () => null, getController: () => null });
    assert.throws(() => manager.init(), /tray icon|icon/i);
    assert.equal(trayCreated, false);
  } finally {
    Module._load = originalLoad;
    Object.defineProperty(process, 'platform', originalPlatform);
    delete require.cache[modulePath];
  }
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
