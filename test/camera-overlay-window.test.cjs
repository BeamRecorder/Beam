const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

function createElectronFixture(savedExtras = {}) {
  const calls = [];
  const windows = [];
  const display = {
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
  };

  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.listeners = new Map();
      this.contentListeners = new Map();
      this.bounds = {
        x: options.x,
        y: options.y,
        width: options.width,
        height: options.height,
      };
      this.visible = false;
      this.destroyed = false;
      this.webContents = {
        getURL: () => 'http://localhost:6500/?cameraOverlay=1',
        once: (event, listener) => this.contentListeners.set(event, listener),
        emit: (event, ...args) => {
          const listener = this.contentListeners.get(event);
          if (!listener) return;
          this.contentListeners.delete(event);
          listener(...args);
        },
        send: (...args) => calls.push(['send', ...args]),
      };
      windows.push(this);
      calls.push(['constructor', options]);
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

    getPosition() {
      return [this.bounds.x, this.bounds.y];
    }

    setBounds(next) {
      this.bounds = { ...this.bounds, ...next };
      calls.push(['bounds', this.getBounds()]);
    }

    setPosition(x, y) {
      this.bounds = { ...this.bounds, x, y };
      calls.push(['position', x, y]);
    }

    setContentProtection(value) {
      calls.push(['contentProtection', value]);
    }

    setAlwaysOnTop(value, level) {
      calls.push(['alwaysOnTop', value, level]);
    }

    showInactive() {
      this.visible = true;
      this.emit('show');
    }

    hide() {
      this.visible = false;
      this.emit('hide');
    }

    moveTop() {
      calls.push(['moveTop']);
    }

    loadURL(url) {
      calls.push(['loadURL', url]);
    }

    loadFile(...args) {
      calls.push(['loadFile', ...args]);
    }

    destroy() {
      this.destroyed = true;
      this.emit('closed');
      this.webContents.emit('destroyed');
    }
  }

  const electron = {
    BrowserWindow: FakeWindow,
    screen: {
      getPrimaryDisplay: () => display,
      getDisplayMatching: () => display,
      getCursorScreenPoint: () => ({ x: 500, y: 400 }),
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };

  const preferenceState = { extras: structuredClone(savedExtras) };
  const patches = [];
  const preferencesStore = {
    read: () => structuredClone(preferenceState),
    patch: (patch) => {
      patches.push(structuredClone(patch));
      preferenceState.extras = { ...preferenceState.extras, ...(patch.extras || {}) };
      return structuredClone(preferenceState);
    },
  };

  return {
    calls,
    windows,
    patches,
    preferencesStore,
    restore: () => {
      Module._load = originalLoad;
    },
  };
}

function loadOverlayWindow() {
  const modulePath = require.resolve('../electron/camera/overlay-window.cjs');
  delete require.cache[modulePath];
  return require(modulePath);
}

test('persists camera overlay position and size after native move and resize events', () => {
  const fixture = createElectronFixture();
  try {
    const { createCameraOverlayWindow } = loadOverlayWindow();
    const overlay = createCameraOverlayWindow({
      applicationRoot: '/app',
      isPackaged: false,
      platform: 'win32',
      preferencesStore: fixture.preferencesStore,
    });

    overlay.configure({ cameraId: 'camera:front' });
    const window = fixture.windows[0];
    window.setBounds({ x: 321, y: 222, width: 500, height: 300 });
    window.emit('move');
    window.emit('resize');
    window.emit('moved');

    assert.deepEqual(fixture.preferencesStore.read().extras.cameraOverlay, {
      x: 321,
      y: 222,
      width: 500,
      height: 300,
    });
    assert.equal(fixture.patches.at(-1).extras.cameraOverlay.x, 321);
    assert.equal(fixture.patches.at(-1).extras.cameraOverlay.y, 222);
    overlay.destroy();
  } finally {
    fixture.restore();
  }
});

test('restores a saved camera overlay placement when creating the native window', () => {
  const fixture = createElectronFixture({
    cameraOverlay: { x: 321, y: 222, width: 500, height: 300 },
  });
  try {
    const { createCameraOverlayWindow } = loadOverlayWindow();
    const overlay = createCameraOverlayWindow({
      applicationRoot: '/app',
      isPackaged: false,
      platform: 'win32',
      preferencesStore: fixture.preferencesStore,
    });

    overlay.configure({ cameraId: 'camera:front' });

    assert.equal(fixture.windows[0].options.width, 500);
    assert.equal(fixture.windows[0].options.height, 300);
    assert.equal(fixture.windows[0].options.x, 321);
    assert.equal(fixture.windows[0].options.y, 222);
    assert.equal(fixture.windows[0].options.resizable, true);
    assert.equal(fixture.windows[0].options.transparent, true);
    assert.equal(fixture.windows[0].options.hasShadow, false);
    overlay.destroy();
  } finally {
    fixture.restore();
  }
});

test('keeps a valid top-left camera overlay placement instead of discarding zero coordinates', () => {
  const fixture = createElectronFixture({
    cameraOverlay: { x: 0, y: 0, width: 500, height: 300 },
  });
  try {
    const { createCameraOverlayWindow } = loadOverlayWindow();
    const overlay = createCameraOverlayWindow({
      applicationRoot: '/app',
      isPackaged: false,
      platform: 'linux',
      preferencesStore: fixture.preferencesStore,
    });

    overlay.configure({ cameraId: 'camera:front' });
    assert.equal(fixture.windows[0].options.x, 0);
    assert.equal(fixture.windows[0].options.y, 0);
    assert.equal(fixture.windows[0].options.transparent, false);
    assert.equal(fixture.windows[0].options.backgroundColor, '#000000');
    assert.equal(fixture.windows[0].options.hasShadow, true);

    fixture.windows[0].setPosition(0, 0);
    fixture.windows[0].emit('move');
    fixture.windows[0].emit('moved');
    assert.deepEqual(fixture.preferencesStore.read().extras.cameraOverlay, {
      x: 0,
      y: 0,
      width: 500,
      height: 300,
    });
    overlay.destroy();
  } finally {
    fixture.restore();
  }
});

test('waits for the overlay renderer before forwarding recording commands', async () => {
  const fixture = createElectronFixture();
  try {
    const { createCameraOverlayWindow } = loadOverlayWindow();
    const overlay = createCameraOverlayWindow({
      applicationRoot: '/app',
      isPackaged: false,
      platform: 'win32',
      preferencesStore: fixture.preferencesStore,
    });
    const command = { commandId: 'command-1', recordingId: 'recording-1', control: { action: 'prepare' } };

    overlay.configure({ cameraId: 'camera:front' });
    const window = fixture.windows[0];
    let settled = false;
    const pending = overlay.sendRecordingCommand(command).then(() => {
      settled = true;
    });
    await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(overlay.markRendererReady({}), false);
    assert.equal(overlay.markRendererReady(window.webContents), true);
    await pending;
    assert.equal(settled, true);
    assert.deepEqual(
      fixture.calls.filter((call) => call[0] === 'send' && call[1] === 'camera-overlay:recording-command').at(-1),
      ['send', 'camera-overlay:recording-command', command],
    );
    overlay.destroy();
  } finally {
    fixture.restore();
  }
});

test('rejects a command waiting for readiness when the overlay closes', async () => {
  const fixture = createElectronFixture();
  try {
    const { createCameraOverlayWindow } = loadOverlayWindow();
    const overlay = createCameraOverlayWindow({ applicationRoot: '/app', isPackaged: false, platform: 'win32' });
    overlay.configure({ cameraId: 'camera:front' });
    const pending = overlay.sendRecordingCommand({ commandId: 'command-1' });
    fixture.windows[0].destroy();
    await assert.rejects(pending, /camera overlay was closed/);
  } finally {
    fixture.restore();
  }
});

test('does not forward a stale command after an aborted readiness wait and a new renderer becomes ready', async () => {
  const fixture = createElectronFixture();
  try {
    const { createCameraOverlayWindow } = loadOverlayWindow();
    const overlay = createCameraOverlayWindow({ applicationRoot: '/app', isPackaged: false, platform: 'win32' });
    const staleCommand = { commandId: 'stale-command', recordingId: 'recording-1' };

    overlay.configure({ cameraId: 'camera:first' });
    const firstWindow = fixture.windows[0];
    const pending = overlay.sendRecordingCommand(staleCommand);
    firstWindow.destroy();
    await assert.rejects(pending, /camera overlay was closed/);

    overlay.configure({ cameraId: 'camera:second' });
    const secondWindow = fixture.windows[1];
    assert.equal(overlay.markRendererReady(secondWindow.webContents), true);
    await Promise.resolve();

    assert.deepEqual(
      fixture.calls.filter((call) => call[0] === 'send' && call[1] === 'camera-overlay:recording-command'),
      [],
    );
    overlay.destroy();
  } finally {
    fixture.restore();
  }
});

test('does not forward an explicitly aborted command when the same renderer becomes ready later', async () => {
  const fixture = createElectronFixture();
  let overlay;
  try {
    const { createCameraOverlayWindow } = loadOverlayWindow();
    overlay = createCameraOverlayWindow({ applicationRoot: '/app', isPackaged: false, platform: 'win32' });
    const staleCommand = { commandId: 'aborted-command', recordingId: 'recording-1' };
    const abort = new AbortController();

    overlay.configure({ cameraId: 'camera:first' });
    const window = fixture.windows[0];
    const pending = overlay.sendRecordingCommand(staleCommand, { signal: abort.signal });
    const outcome = pending.then(
      () => 'resolved',
      () => 'rejected',
    );
    abort.abort();
    const outcomeBeforeReady = await Promise.race([
      outcome,
      new Promise((resolve) => setTimeout(() => resolve('pending'), 25)),
    ]);
    assert.equal(overlay.markRendererReady(window.webContents), true);
    await pending.catch(() => undefined);
    assert.equal(outcomeBeforeReady, 'rejected');
    assert.deepEqual(
      fixture.calls.filter((call) => call[0] === 'send' && call[1] === 'camera-overlay:recording-command'),
      [],
    );
  } finally {
    overlay?.destroy();
    fixture.restore();
  }
});

test('notifies the main process when the overlay web contents are destroyed', () => {
  const fixture = createElectronFixture();
  const destroyed = [];
  try {
    const { createCameraOverlayWindow } = loadOverlayWindow();
    const overlay = createCameraOverlayWindow({
      applicationRoot: '/app',
      isPackaged: false,
      platform: 'win32',
      onWebContentsDestroyed: (contents) => destroyed.push(contents),
    });
    overlay.configure({ cameraId: 'camera:front' });
    const contents = fixture.windows[0].webContents;
    fixture.windows[0].destroy();
    assert.deepEqual(destroyed, [contents]);
  } finally {
    fixture.restore();
  }
});
