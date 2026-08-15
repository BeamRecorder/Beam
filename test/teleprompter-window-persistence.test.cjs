const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

function createElectronFixture(savedBounds = null) {
  const windows = [];
  const display = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
  const preferenceState = { extras: savedBounds ? { teleprompterWindow: savedBounds } : {} };
  const patches = [];

  class FakeWindow {
    static getAllWindows() {
      return windows;
    }

    constructor(options) {
      this.options = options;
      this.bounds = {
        x: options.x,
        y: options.y,
        width: options.width,
        height: options.height,
      };
      this.listeners = new Map();
      this.contentListeners = new Map();
      this.visible = false;
      this.destroyed = false;
      this.webContents = {
        once: (event, listener) => this.contentListeners.set(event, listener),
        send: () => undefined,
      };
      windows.push(this);
    }

    on(event, listener) {
      this.listeners.set(event, listener);
    }

    once(event, listener) {
      this.listeners.set(event, (...args) => {
        this.listeners.delete(event);
        listener(...args);
      });
    }

    emit(event, ...args) {
      this.listeners.get(event)?.(...args);
    }

    isDestroyed() {
      return this.destroyed;
    }

    isVisible() {
      return this.visible;
    }

    getBounds() {
      return { ...this.bounds };
    }

    setBounds(next) {
      this.bounds = { ...this.bounds, ...next };
    }

    setAlwaysOnTop() {}

    show() {
      this.visible = true;
      this.emit('show');
    }

    showInactive() {
      this.visible = true;
      this.emit('show');
    }

    hide() {
      this.visible = false;
      this.emit('hide');
    }

    moveTop() {}

    loadURL() {}

    loadFile() {}

    destroy() {
      this.destroyed = true;
      this.emit('closed');
    }
  }

  const electron = {
    BrowserWindow: FakeWindow,
    screen: {
      getDisplayNearestPoint: () => display,
      getCursorScreenPoint: () => ({ x: 400, y: 300 }),
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };

  const preferencesStore = {
    read: () => structuredClone(preferenceState),
    patch: (patch) => {
      patches.push(structuredClone(patch));
      preferenceState.extras = { ...preferenceState.extras, ...(patch.extras || {}) };
      return structuredClone(preferenceState);
    },
  };

  return {
    windows,
    patches,
    preferencesStore,
    restore: () => {
      Module._load = originalLoad;
    },
  };
}

function loadTeleprompterWindow() {
  const modulePath = require.resolve('../electron/teleprompter/teleprompter-window.cjs');
  delete require.cache[modulePath];
  return require(modulePath);
}

test('persists teleprompter bounds after native move and resize events', () => {
  const fixture = createElectronFixture();
  try {
    const { createTeleprompterWindow } = loadTeleprompterWindow();
    const teleprompter = createTeleprompterWindow({
      applicationRoot: '/app',
      isPackaged: false,
      preferencesStore: fixture.preferencesStore,
    });

    teleprompter.showInactive();
    const window = fixture.windows[0];
    window.setBounds({ x: 355, y: 277, width: 800, height: 500 });
    window.emit('move');
    window.emit('resize');
    window.emit('close');

    assert.deepEqual(fixture.patches.at(-1).extras.teleprompterWindow, {
      x: 355,
      y: 277,
      width: 800,
      height: 500,
    });
    teleprompter.destroy();
  } finally {
    fixture.restore();
  }
});

test('restores persisted teleprompter x/y and dimensions on the next window', () => {
  const fixture = createElectronFixture({ x: 355, y: 277, width: 800, height: 500 });
  try {
    const { createTeleprompterWindow } = loadTeleprompterWindow();
    const teleprompter = createTeleprompterWindow({
      applicationRoot: '/app',
      isPackaged: false,
      preferencesStore: fixture.preferencesStore,
    });

    teleprompter.prepare();

    assert.equal(fixture.windows[0].options.x, 355);
    assert.equal(fixture.windows[0].options.y, 277);
    assert.equal(fixture.windows[0].options.width, 800);
    assert.equal(fixture.windows[0].options.height, 500);
    teleprompter.destroy();
  } finally {
    fixture.restore();
  }
});
