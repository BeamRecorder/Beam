const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { createRendererSetup } = require('../apps/desktop/electron/lifecycle/renderer-setup.cjs');
const { HUD_SIZE, WindowController } = require('../apps/desktop/electron/window/window-controller.cjs');

function createFixture({ onboardingCompleted = true, environment = {} } = {}) {
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
      this.bounds = {
        x: 100,
        y: 100,
        width: options.width,
        height: options.height,
      };
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
  const preferencesStore = {
    read: () => ({ onboardingCompleted, extras: {} }),
  };
  try {
    const setup = createRendererSetup({
      app: { isPackaged: false },
      BrowserWindow: FakeBrowserWindow,
      session: {},
      desktopCapturer: {},
      applicationRoot,
      controllers,
      logStartup: (message) => calls.push(['log', message]),
      environment,
    });
    const window = setup.createWindow(preferencesStore, '/beam-app/public/brand/BeamIcon.png');
    return {
      calls,
      setup,
      BrowserWindow: FakeBrowserWindow,
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

test('creates the HUD at the canonical native size with isolated renderer settings', () => {
  const fixture = createFixture();
  const options = fixture.window.options;

  assert.equal(HUD_SIZE.width, 672);
  assert.equal(HUD_SIZE.height, 268);
  assert.equal(options.width, HUD_SIZE.width);
  assert.equal(options.height, HUD_SIZE.height);

  assert.equal(options.show, false);
  assert.equal(options.webPreferences.preload, path.join(fixture.applicationRoot, 'apps/desktop/electron/preload.cjs'));
  assert.equal(options.webPreferences.nodeIntegration, false);
  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(fixture.controllers.get(fixture.window) instanceof WindowController, true);
  assert.ok(fixture.calls.some(([name, url]) => name === 'loadURL' && url === 'http://localhost:6500/html/index.html'));
});

test('loads the HUD from its session port and trusts only that renderer origin', () => {
  const environment = { BEAM_DEV_SERVER_URL: 'http://localhost:6508' };
  const fixture = createFixture({ environment });
  assert.ok(fixture.calls.some(([name, url]) => name === 'loadURL' && url === 'http://localhost:6508/html/index.html'));
  const setup = createRendererSetup({ app: { isPackaged: false }, applicationRoot: '/beam-app', environment });
  assert.equal(setup.isTrustedRenderer('http://localhost:6508/html/editor.html'), true);
  assert.equal(setup.isTrustedRenderer('http://localhost:6500/html/editor.html'), false);
  assert.equal(setup.isTrustedRenderer('http://localhost:6508/html/untrusted.html'), false);
});

test('packaged renderers cannot obtain media permissions from a development origin', () => {
  const setup = createRendererSetup({
    app: { isPackaged: true },
    applicationRoot: '/beam-app',
    environment: { BEAM_DEV_SERVER_URL: 'http://localhost:6508' },
  });
  assert.equal(setup.isTrustedRenderer('http://localhost:6508/html/index.html'), false);
  assert.equal(setup.isTrustedRenderer('file:///beam-app/dist/html/index.html'), true);
});

test('preference changes update only the transparent HUD controller', () => {
  const fixture = createFixture();
  const onboarding = {};
  const editor = {};
  fixture.controllers.set(onboarding, { applyModePolicy: () => assert.fail('onboarding has no HUD policy') });
  fixture.controllers.set(editor, { applyModePolicy: () => assert.fail('editor has no HUD policy') });
  fixture.BrowserWindow.getAllWindows = () => [onboarding, fixture.window, editor, {}];
  const calls = [];
  fixture.controller.setHudAlwaysOnTop = (value) => calls.push(['topmost', value]);
  fixture.controller.applyModePolicy = () => calls.push(['policy']);
  fixture.setup.applyHudPreferences({ alwaysOnTop: false });
  fixture.setup.applyHudPreferences({ alwaysOnTop: true });
  assert.deepEqual(calls, [
    ['topmost', false],
    ['topmost', true],
  ]);
});

test('preference changes before a HUD exists leave onboarding controllers usable', () => {
  const fixture = createFixture();
  const onboarding = {};
  fixture.controllers.set(onboarding, { applyModePolicy: () => assert.fail('unexpected policy') });
  fixture.BrowserWindow.getAllWindows = () => [onboarding];
  assert.doesNotThrow(() => fixture.setup.applyHudPreferences({ alwaysOnTop: false }));
  fixture.BrowserWindow.getAllWindows = () => [];
  assert.doesNotThrow(() => fixture.setup.applyHudPreferences({ alwaysOnTop: true }));
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
  assert.equal(setup.isTrustedRenderer('http://localhost:6500/html/quick-snip-status.html?quickSnipStatus=1'), true);
  assert.equal(setup.isTrustedRenderer('http://localhost:6500/html/source-picker.html?role=chooser'), true);
  assert.equal(setup.isTrustedRenderer('http://localhost:6501/quick-snip-status.html'), false);
  assert.equal(setup.isTrustedRenderer('http://localhost:6500/untrusted.html'), false);
});

test('trusts each moved desktop entry at its exact development URL', () => {
  const setup = createRendererSetup({ applicationRoot: '/beam-app' });
  for (const entry of [
    'index',
    'countdown',
    'editor',
    'teleprompter',
    'onboarding',
    'hud-panel',
    'quick-snip-status',
    'screen-region',
    'region-marker',
  ]) {
    assert.equal(setup.isTrustedRenderer(`http://localhost:6500/html/${entry}.html`), true, entry);
    assert.equal(setup.isTrustedRenderer(`http://localhost:6500/${entry}.html`), false, entry);
  }
});
test('does not authorize arbitrary HTML files or similar-looking development origins', () => {
  const setup = createRendererSetup({ applicationRoot: '/beam-app' });
  for (const url of [
    'http://localhost:6500/',
    'http://localhost:6500/html/untrusted.html',
    'http://localhost:6500/html/nested/index.html',
    'http://localhost:6501/html/index.html',
    'https://localhost:6500/html/index.html',
    'http://localhost:6500.example.com/html/index.html',
  ]) {
    assert.equal(setup.isTrustedRenderer(url), false, url);
  }
});
