const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { createRendererSetup } = require('../electron/lifecycle/renderer-setup.cjs');
const { HUD_SIZE, WindowController } = require('../electron/window/window-controller.cjs');

function createFixture({ onboardingCompleted = true } = {}) {
  const calls = [];
  let visible = false;
  const applicationRoot = '/beam-app';
  const electron = {
    screen: {
      getDisplayNearestPoint: () => ({
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      }),
      getCursorScreenPoint: () => ({ x: 960, y: 540 }),
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return electron;
    return originalLoad.call(this, request, parent, isMain);
  };

  class FakeBrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.bounds = { x: 100, y: 100, width: options.width, height: options.height };
      this.webContents = new EventEmitter();
      this.webContents.openDevTools = (options) => calls.push(['openDevTools', options]);
      calls.push(['constructor', options]);
    }

    isDestroyed() {
      return false;
    }

    isVisible() {
      return visible;
    }

    isMinimized() {
      return false;
    }

    isMaximized() {
      return false;
    }

    getPosition() {
      return [this.bounds.x, this.bounds.y];
    }

    getBounds() {
      return { ...this.bounds };
    }

    setPosition(x, y) {
      this.bounds = { ...this.bounds, x, y };
      calls.push(['setPosition', x, y]);
    }

    setMinimumSize(width, height) {
      calls.push(['setMinimumSize', width, height]);
    }

    setIgnoreMouseEvents(ignore, options) {
      calls.push(['setIgnoreMouseEvents', ignore, options]);
    }

    setAlwaysOnTop(value, level) {
      calls.push(['setAlwaysOnTop', value, level]);
    }

    moveTop() {
      calls.push(['moveTop']);
    }

    setResizable(value) {
      calls.push(['setResizable', value]);
    }

    setMaximizable(value) {
      calls.push(['setMaximizable', value]);
    }

    setContentProtection(value) {
      calls.push(['setContentProtection', value]);
    }

    showInactive() {
      visible = true;
      calls.push(['showInactive']);
      this.emit('show');
    }

    loadURL(url) {
      calls.push(['loadURL', url]);
    }

    loadFile(file) {
      calls.push(['loadFile', file]);
    }
  }

  const controllers = new Map();
  const preferencesStore = { read: () => ({ onboardingCompleted, extras: {} }) };
  try {
    const setup = createRendererSetup({
      app: { isPackaged: false },
      BrowserWindow: FakeBrowserWindow,
      session: {},
      desktopCapturer: {},
      applicationRoot,
      controllers,
      logStartup: (message) => calls.push(['log', message]),
    });
    const window = setup.createWindow(preferencesStore, '/beam-app/public/brand/BeamIcon.png');
    return {
      calls,
      controllers,
      window,
      controller: controllers.get(window),
      getVisible: () => visible,
      applicationRoot,
    };
  } finally {
    Module._load = originalLoad;
  }
}

test('creates the HUD at the expanded native size with isolated renderer settings', () => {
  const fixture = createFixture();
  const options = fixture.window.options;

  assert.equal(HUD_SIZE.width, 392);
  assert.equal(HUD_SIZE.height, 512);
  assert.equal(options.width, HUD_SIZE.width);
  assert.equal(options.height, HUD_SIZE.height);

  assert.equal(options.show, false);
  assert.equal(options.webPreferences.preload, path.join(fixture.applicationRoot, 'electron/preload.cjs'));
  assert.equal(options.webPreferences.nodeIntegration, false);
  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(fixture.controllers.get(fixture.window) instanceof WindowController, true);
  assert.ok(fixture.calls.some(([name, url]) => name === 'loadURL' && url === 'http://localhost:6500'));
});

test('keeps the HUD hidden until ready-to-show, then applies native size constraints', () => {
  const fixture = createFixture();
  const beforeReady = fixture.calls.map(([name]) => name);

  assert.equal(fixture.getVisible(), false);
  assert.equal(fixture.controller.ready, false);
  assert.equal(beforeReady.includes('showInactive'), false);
  assert.equal(
    fixture.calls.some(([name]) => name === 'setMinimumSize'),
    false,
  );

  fixture.window.emit('ready-to-show');

  assert.equal(fixture.getVisible(), true);
  assert.equal(fixture.controller.ready, true);
  assert.equal(fixture.calls.filter(([name]) => name === 'showInactive').length, 1);
  assert.ok(
    fixture.calls.some(
      ([name, width, height]) => name === 'setMinimumSize' && width === HUD_SIZE.width && height === HUD_SIZE.height,
    ),
  );
  assert.ok(fixture.calls.some(([name, value]) => name === 'setResizable' && value === false));
  assert.ok(fixture.calls.some(([name, value]) => name === 'setMaximizable' && value === false));
});

test('does not show the HUD when onboarding is not complete', () => {
  const fixture = createFixture({ onboardingCompleted: false });

  fixture.window.emit('ready-to-show');

  assert.equal(fixture.getVisible(), false);
  assert.equal(fixture.controller.ready, false);
  assert.equal(fixture.calls.filter(([name]) => name === 'showInactive').length, 0);
});

test('trusts the dedicated local status entry but rejects unrelated origins and paths', () => {
  const setup = createRendererSetup({ applicationRoot: '/beam-app' });
  assert.equal(setup.isTrustedRenderer('http://localhost:6500/quick-snip-status.html?quickSnipStatus=1'), true);
  assert.equal(setup.isTrustedRenderer('http://localhost:6501/quick-snip-status.html'), false);
  assert.equal(setup.isTrustedRenderer('http://localhost:6500/untrusted.html'), false);
});
