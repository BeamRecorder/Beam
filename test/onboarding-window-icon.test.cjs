const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

test('onboarding window passes appIconPath to BrowserWindow', () => {
  const windows = [];
  const listeners = new Map();
  const handlers = new Map();

  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.destroyed = false;
      windows.push(this);
    }

    isDestroyed() {
      return this.destroyed;
    }

    isMinimized() {
      return false;
    }

    on(event, listener) {
      listeners.set(event, listener);
    }

    once(event, listener) {
      listeners.set(event, listener);
    }

    show() {}

    focus() {}

    loadURL() {}

    destroy() {
      this.destroyed = true;
      listeners.get('closed')?.();
    }
  }

  const electron = { BrowserWindow: FakeWindow };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../electron/window/onboarding-window.cjs');
    delete require.cache[modulePath];
    const { createOnboardingWindowManager } = require(modulePath);
    const appIconPath = '/app/dist/brand/BeamIcon.png';
    const manager = createOnboardingWindowManager({
      applicationRoot: '/app',
      isPackaged: false,
      ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) },
      hudWindow: {
        isDestroyed: () => false,
        isMinimized: () => false,
        show: () => undefined,
        focus: () => undefined,
      },
      hudController: {},
      preferencesStore: { read: () => ({}) },
      appIconPath,
    });

    manager.open();

    assert.equal(windows.length, 1);
    assert.equal(windows[0].options.icon, appIconPath);
    assert.equal(handlers.has('onboarding:open'), true);
  } finally {
    Module._load = originalLoad;
  }
});
