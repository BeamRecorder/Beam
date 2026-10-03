const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const test = require('node:test');

function fixture({ theme = 'light', initialDark = false, isPackaged = false, loadError } = {}) {
  const windows = [];
  const handlers = new Map();
  const controllers = [];
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.shows = 0;
      this.focuses = 0;
      this.destroyed = false;
      windows.push(this);
    }
    isDestroyed() {
      return this.destroyed;
    }
    isMinimized() {
      return Boolean(this.minimized);
    }
    restore() {
      this.minimized = false;
    }
    show() {
      this.shows++;
    }
    focus() {
      this.focuses++;
    }
    hide() {
      this.hidden = true;
    }
    loadURL(url) {
      this.url = url;
      return loadError ? Promise.reject(loadError) : Promise.resolve();
    }
    loadFile(file) {
      this.file = file;
      return Promise.resolve();
    }
    close() {
      this.emit('close');
      this.destroy();
    }
    destroy() {
      this.destroyed = true;
      this.emit('closed');
    }
  }
  const original = Module._load;
  Module._load = function (request, parent, main) {
    return request === 'electron' ? { BrowserWindow: FakeWindow } : original.call(this, request, parent, main);
  };
  let createOnboardingWindowManager;
  try {
    const modulePath = require.resolve('../apps/desktop/electron/window/onboarding-window.cjs');
    delete require.cache[modulePath];
    ({ createOnboardingWindowManager } = require(modulePath));
  } finally {
    Module._load = original;
  }
  const patches = [];
  const preferencesStore = { read: () => ({ theme }), patch: (patch) => patches.push(patch) };
  const hudWindow = new FakeWindow({});
  windows.length = 0;
  const manager = createOnboardingWindowManager({
    applicationRoot: '/app',
    isPackaged,
    initialDark,
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    hudWindow,
    hudController: {},
    preferencesStore,
    appIconPath: '/app/dist/brand/BeamIcon.png',
    registerController: (_window, controller) => controllers.push(controller),
  });
  return { windows, handlers, controllers, manager, hudWindow, preferencesStore, patches };
}

test('onboarding preserves its native icon, opaque bounds and preload boundary', () => {
  const f = fixture();
  f.manager.open();
  const window = f.windows[0];
  assert.equal(window.options.icon, '/app/dist/brand/BeamIcon.png');
  assert.equal(window.options.width, 920);
  assert.equal(window.options.height, 720);
  assert.equal(window.options.minHeight, 600);
  assert.equal(window.options.minWidth, 800);
  assert.equal(window.options.transparent, false);
  assert.equal(window.options.backgroundColor, '#faf9f6');
  assert.equal(window.options.webPreferences.nodeIntegration, false);
  assert.equal(window.options.webPreferences.contextIsolation, true);
  assert.equal(f.handlers.has('onboarding:open'), true);
});

test('open waits for native readiness before presenting and can restore an existing window', () => {
  const f = fixture();
  f.handlers.get('onboarding:open')();
  const window = f.windows[0];
  assert.equal(window.shows, 0);
  window.emit('ready-to-show');
  assert.equal(window.shows, 1);
  window.minimized = true;
  f.manager.open();
  assert.equal(window.minimized, false);
  assert.equal(window.shows, 2);
  assert.equal(f.windows.length, 1);
});

test('generic visibility controller also honors readiness', () => {
  const f = fixture();
  f.manager.open();
  const controller = f.controllers[0];
  controller.setVisible(true);
  assert.equal(f.windows[0].shows, 0);
  f.windows[0].emit('ready-to-show');
  controller.setVisible(false);
  assert.equal(f.windows[0].hidden, true);
  controller.setVisible(true);
  assert.equal(f.windows[0].shows, 2);
});

for (const config of [{ theme: 'dark' }, { theme: 'system', initialDark: true }]) {
  test(`native backdrop matches dark appearance: ${JSON.stringify(config)}`, () => {
    const f = fixture(config);
    f.manager.open();
    assert.equal(f.windows[0].options.backgroundColor, '#111114');
  });
}

test('packaged onboarding loads its own renderer document', () => {
  const f = fixture({ isPackaged: true });
  f.manager.open();
  assert.equal(f.windows[0].file, '/app/dist/html/onboarding.html');
});

for (const action of ['close', 'complete']) {
  test(`${action} persists completion before returning to the HUD`, () => {
    const f = fixture();
    f.manager.open();
    assert.equal(f.handlers.get(`onboarding:${action}`)(), true);
    assert.equal(f.manager.getWindow(), null);
    assert.equal(f.hudWindow.shows, 1);
    assert.deepEqual(f.patches[0], { onboardingCompleted: true });
  });
  test(`${action} propagates persistence failure and keeps onboarding open`, () => {
    const f = fixture();
    f.manager.open();
    f.preferencesStore.patch = () => {
      throw new Error('disk full');
    };
    assert.throws(() => f.handlers.get(`onboarding:${action}`)(), /disk full/);
    assert.equal(f.windows[0].destroyed, false);
    assert.equal(f.hudWindow.shows, 0);
  });
}

test('native closing marks completion and presents the HUD', () => {
  const f = fixture();
  f.manager.open();
  f.windows[0].close();
  assert.equal(f.hudWindow.shows, 1);
  assert.equal(f.patches.length, 1);
});

test('destroy never presents the HUD and late readiness cannot show a replacement', () => {
  const f = fixture();
  f.manager.open();
  const previous = f.windows[0];
  f.manager.destroy();
  assert.equal(f.hudWindow.shows, 0);
  f.manager.open();
  previous.emit('ready-to-show');
  assert.equal(f.windows[1].shows, 0);
  f.windows[1].emit('ready-to-show');
  assert.equal(f.windows[1].shows, 1);
});

test('renderer load failure releases the hidden window without marking onboarding complete', async () => {
  const f = fixture({ loadError: new Error('renderer unavailable') });
  const original = console.error;
  console.error = () => {};
  try {
    f.manager.open();
    await Promise.resolve();
    assert.equal(f.windows[0].destroyed, true);
    assert.equal(f.patches.length, 0);
    assert.equal(f.hudWindow.shows, 1);
  } finally {
    console.error = original;
  }
});
