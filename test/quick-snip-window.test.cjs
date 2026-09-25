const assert = require('node:assert/strict');
const test = require('node:test');

const { createQuickSnipWindow } = require('../electron/quick-snip/quick-snip-window.cjs');

const display = {
  id: 2,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
};

function createFixture(
  targetDisplay = display,
  platform = 'linux',
  { preferenceState = { extras: {} }, environment = {} } = {},
) {
  const calls = [];
  const windows = [];
  const timers = new Map();
  const preferenceWrites = [];
  let timerId = 0;
  const preferencesStore = {
    read: () => preferenceState,
    patch: ({ extras }) => {
      preferenceWrites.push(extras);
      for (const [key, value] of Object.entries(extras ?? {})) {
        preferenceState.extras[key] = { ...(preferenceState.extras[key] ?? {}), ...value };
      }
    },
  };

  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.bounds = {
        x: 0,
        y: 0,
        width: options.width,
        height: options.height,
      };
      this.listeners = new Map();
      this.visible = false;
      this.destroyed = false;
      this.webContents = {
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

    setBounds(bounds) {
      this.bounds = { ...this.bounds, ...bounds };
      calls.push(['setBounds', this.getBounds()]);
    }

    setContentProtection(value) {
      calls.push(['contentProtection', value]);
    }

    setAlwaysOnTop(value, level) {
      calls.push(['alwaysOnTop', value, level]);
    }

    setParentWindow(parent) {
      calls.push(['parent', parent]);
    }

    showInactive() {
      this.visible = true;
      calls.push(['showInactive']);
    }

    hide() {
      this.visible = false;
      calls.push(['hide']);
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

    getNativeWindowHandle() {
      return Buffer.from('quick-snip-window');
    }

    getMediaSourceId() {
      return 'window:123:Quick Snip';
    }

    destroy() {
      this.destroyed = true;
      this.emit('closed');
    }
  }

  const crop = createQuickSnipWindow({
    BrowserWindow: FakeWindow,
    applicationRoot: '/app',
    isPackaged: false,
    platform,
    appIconPath: '/app/icon.png',
    preferencesStore,
    environment,
    setTimer: (callback, delay) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    clearTimer: (id) => timers.delete(id),
    screen: {
      getDisplayMatching: () => targetDisplay,
    },
  });

  return { calls, windows, crop, timers, preferenceState, preferenceWrites };
}

function configuration() {
  return {
    mode: 'studio',
    format: 'mp4',
    screenKind: 'display',
    region: { x: 0.25, y: 0.2, width: 0.5, height: 0.3 },
  };
}

function linuxWindowConfiguration() {
  return {
    ...configuration(),
    screenKind: 'window',
    region: null,
  };
}

test('shows the Crop Bar after native and renderer readiness while the region selection is pending', () => {
  const fixture = createFixture();
  fixture.crop.show(configuration(), display);

  const window = fixture.windows[0];
  assert.equal(window.visible, false);
  assert.deepEqual({ width: window.options.width, height: window.options.height }, { width: 480, height: 132 });
  assert.deepEqual(window.getBounds(), {
    x: 720,
    y: 550,
    width: 480,
    height: 132,
  });
  assert.equal(
    fixture.calls.some((call) => call[0] === 'showInactive'),
    false,
  );

  window.emit('ready-to-show');
  assert.equal(window.visible, false);
  assert.equal(fixture.crop.rendererReady(window.webContents), true);
  assert.equal(window.visible, true);
  assert.equal(
    fixture.calls.some((call) => call[0] === 'showInactive'),
    true,
  );
  const configureCall = fixture.calls.find((call) => call[0] === 'send' && call[1] === 'quick-snip:configure');
  assert.equal(configureCall[2].mode, 'studio');
  assert.equal(configureCall[2].excludedWindowHandle, '717569636b2d736e69702d77696e646f77');
  assert.equal(window.options.webPreferences.backgroundThrottling, false);
});

test('places a Linux window capture bar centered at the bottom without a parent', () => {
  const fixture = createFixture(display, 'linux');
  fixture.crop.show(linuxWindowConfiguration(), display);

  const window = fixture.windows[0];
  assert.equal(window.options.parent, null);
  assert.equal(
    fixture.calls.some((call) => call[0] === 'parent' && call[1] !== null),
    false,
  );
  assert.deepEqual(window.getBounds(), {
    x: 720,
    y: 932,
    width: 480,
    height: 132,
  });

  window.emit('ready-to-show');
  assert.equal(fixture.crop.rendererReady(window.webContents), true);
  const configureCall = fixture.calls.find((call) => call[0] === 'send' && call[1] === 'quick-snip:configure');
  assert.equal(configureCall[2].screenKind, 'window');
  assert.equal(configureCall[2].region, null);
  assert.equal(configureCall[2].hideWhileRecording, undefined);
});

for (const platform of ['linux', 'win32', 'darwin']) {
  test(`${platform} places an uncropped display capture bar without region geometry`, () => {
    const fixture = createFixture(display, platform);
    const selected = { ...configuration(), screenKind: 'display', screenId: 'portal:monitor', region: null };

    assert.doesNotThrow(() => fixture.crop.show(selected, display));
    const window = fixture.windows[0];
    assert.deepEqual(window.getBounds(), { x: 720, y: 932, width: 480, height: 132 });
    window.emit('ready-to-show');
    assert.equal(fixture.crop.rendererReady(window.webContents), true);
    const configureCall = fixture.calls.find((call) => call[0] === 'send' && call[1] === 'quick-snip:configure');
    assert.equal(configureCall[2].screenKind, 'display');
    assert.equal(configureCall[2].screenId, 'portal:monitor');
    assert.equal(configureCall[2].region, null);
  });
}

test('keeps a Linux window capture bar visible while recording', () => {
  const fixture = createFixture(display, 'linux');
  fixture.crop.show(linuxWindowConfiguration(), display);
  const window = fixture.windows[0];
  window.emit('ready-to-show');
  fixture.crop.rendererReady(window.webContents);

  fixture.calls.length = 0;
  fixture.crop.setRecording(true);

  assert.equal(window.visible, true);
  assert.equal(
    fixture.calls.some((call) => call[0] === 'hide'),
    false,
  );
});

test('keeps a Linux window capture bar visible when start is queued before readiness', () => {
  const fixture = createFixture(display, 'linux');
  fixture.crop.show(linuxWindowConfiguration(), display);
  const window = fixture.windows[0];

  fixture.crop.command('start');
  assert.equal(window.visible, false);
  assert.equal(
    fixture.calls.some((call) => call[0] === 'hide'),
    false,
  );

  window.emit('ready-to-show');
  assert.equal(window.visible, false);
  assert.equal(fixture.crop.rendererReady(window.webContents), true);
  assert.equal(window.visible, true);
  assert.equal(
    fixture.calls.some((call) => call[0] === 'hide'),
    false,
  );
  assert.ok(
    fixture.calls.findIndex((call) => call[0] === 'send' && call[1] === 'quick-snip:command' && call[2] === 'start') >=
      0,
  );
});

test('keeps the Crop Bar visible when recording visibility toggles outside Linux auto-hide mode', () => {
  const fixture = createFixture(display, 'darwin');
  fixture.crop.show(configuration(), display);
  const window = fixture.windows[0];
  window.emit('ready-to-show');
  fixture.crop.rendererReady(window.webContents);

  assert.equal(window.visible, true);
  fixture.crop.setRecording(true);
  assert.equal(window.visible, true);
  fixture.crop.setRecording(false);
  assert.equal(window.visible, true);
  assert.equal(
    fixture.calls.some((call) => call[0] === 'hide'),
    false,
  );
});

test('attaches to the selection overlay and can detach before the overlay is confirmed', () => {
  const fixture = createFixture();
  fixture.crop.show(configuration(), display);
  const selectionOverlay = {
    id: 'selection-overlay',
    isDestroyed: () => false,
    isVisible: () => true,
    on: () => {},
    removeListener: () => {},
  };

  fixture.crop.setParentWindow(selectionOverlay);
  assert.deepEqual(fixture.calls.at(-1), ['parent', selectionOverlay]);

  fixture.crop.setParentWindow(null);
  assert.deepEqual(fixture.calls.at(-1), ['parent', null]);
});

test('parents the Crop Bar before presenting it and waits for both native and renderer readiness', () => {
  const fixture = createFixture();
  const parentListeners = new Map();
  const selectionOverlay = {
    id: 'selection-overlay',
    isDestroyed: () => false,
    isVisible: () => true,
    on: (event, listener) => parentListeners.set(event, listener),
    removeListener: (event, listener) => {
      if (parentListeners.get(event) === listener) parentListeners.delete(event);
    },
  };

  fixture.crop.show(configuration(), display, selectionOverlay);
  const window = fixture.windows[0];
  assert.equal(window.options.parent, selectionOverlay);
  assert.equal(window.visible, false);

  const parentIndex = fixture.calls.findIndex((call) => call[0] === 'parent' && call[1] === selectionOverlay);
  window.emit('ready-to-show');
  assert.equal(window.visible, false);
  assert.equal(fixture.crop.rendererReady(window.webContents), true);

  const showIndex = fixture.calls.findIndex((call) => call[0] === 'showInactive');
  assert.ok(parentIndex >= 0);
  assert.ok(showIndex > parentIndex);
  assert.equal(window.visible, true);
  assert.equal(parentListeners.has('show'), true);
  assert.equal(parentListeners.has('focus'), true);

  fixture.crop.setParentWindow(null);
  assert.equal(parentListeners.size, 0);
});

test('delivers a start command queued before readiness', () => {
  const fixture = createFixture(display, 'darwin');
  fixture.crop.show(configuration(), display);
  const window = fixture.windows[0];

  fixture.crop.command('start');
  assert.equal(
    fixture.calls.some((call) => call[0] === 'send'),
    false,
  );

  fixture.crop.rendererReady(window.webContents);
  assert.equal(
    fixture.calls.some((call) => call[0] === 'send'),
    false,
  );
  window.emit('ready-to-show');

  assert.deepEqual(
    fixture.calls.filter((call) => call[0] === 'send').map((call) => call.slice(1, 3)),
    [
      [
        'quick-snip:configure',
        fixture.calls.find((call) => call[0] === 'send' && call[1] === 'quick-snip:configure')[2],
      ],
      ['quick-snip:command', 'start'],
    ],
  );
});

test('replaces a queued start with cancel before readiness', () => {
  const fixture = createFixture(display, 'darwin');
  fixture.crop.show(configuration(), display);
  const window = fixture.windows[0];

  fixture.crop.command('start');
  fixture.crop.command('cancel');
  window.emit('ready-to-show');
  fixture.crop.rendererReady(window.webContents);

  assert.deepEqual(
    fixture.calls.filter((call) => call[0] === 'send').map((call) => [call[1], call[2]]),
    [
      [
        'quick-snip:configure',
        fixture.calls.find((call) => call[0] === 'send' && call[1] === 'quick-snip:configure')[2],
      ],
      ['quick-snip:command', 'cancel'],
    ],
  );
});

test('hiding before readiness clears queued commands and prevents late presentation', () => {
  const fixture = createFixture(display, 'darwin');
  fixture.crop.show(configuration(), display);
  const window = fixture.windows[0];

  fixture.crop.command('start');
  fixture.crop.hide();
  window.emit('ready-to-show');
  assert.equal(fixture.crop.rendererReady(window.webContents), true);

  assert.equal(window.visible, false);
  assert.equal(
    fixture.calls.some((call) => call[0] === 'send'),
    false,
  );
});

test('rejects renderer readiness from an unrelated or destroyed renderer', () => {
  const fixture = createFixture();
  assert.equal(fixture.crop.rendererReady({}), false);

  fixture.crop.show(configuration(), display);
  const window = fixture.windows[0];
  fixture.crop.destroy();

  assert.equal(fixture.crop.rendererReady(window.webContents), false);
});

test('waits for a hidden parent and presents after the parent becomes visible', () => {
  const fixture = createFixture();
  const parentListeners = new Map();
  let parentVisible = false;
  const selectionOverlay = {
    isDestroyed: () => false,
    isVisible: () => parentVisible,
    on: (event, listener) => parentListeners.set(event, listener),
    removeListener: (event, listener) => {
      if (parentListeners.get(event) === listener) parentListeners.delete(event);
    },
    emit: (event) => parentListeners.get(event)?.(),
  };

  fixture.crop.show(configuration(), display, selectionOverlay);
  const window = fixture.windows[0];
  window.emit('ready-to-show');
  fixture.crop.rendererReady(window.webContents);

  assert.equal(window.visible, false);
  parentVisible = true;
  selectionOverlay.emit('focus');
  assert.equal(window.visible, true);
  assert.equal(parentListeners.has('show'), true);
  assert.equal(parentListeners.has('focus'), true);

  fixture.crop.setParentWindow(null);
  assert.equal(parentListeners.size, 0);
});

test('removes parent presentation listeners when the Crop Bar is destroyed', () => {
  const fixture = createFixture();
  const parentListeners = new Map();
  const selectionOverlay = {
    isDestroyed: () => false,
    isVisible: () => true,
    on: (event, listener) => parentListeners.set(event, listener),
    removeListener: (event, listener) => {
      if (parentListeners.get(event) === listener) parentListeners.delete(event);
    },
  };

  fixture.crop.show(configuration(), display, selectionOverlay);
  fixture.crop.destroy();

  assert.equal(parentListeners.size, 0);
});

test('keeps a Linux user-dragged placement reported by move', () => {
  const fixture = createFixture(display, 'linux');
  fixture.crop.show(configuration(), display);
  const window = fixture.windows[0];
  window.emit('ready-to-show');
  fixture.crop.rendererReady(window.webContents);

  window.setBounds({ x: 712, y: 620 });
  window.emit('move');
  const draggedBounds = window.getBounds();

  assert.equal(fixture.crop.updateRegion({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, display), true);
  assert.deepEqual(window.getBounds(), draggedBounds);
});

test('ignores both move notifications from one programmatic placement', () => {
  const fixture = createFixture(display, 'linux');
  fixture.crop.show(configuration(), display);
  const window = fixture.windows[0];
  window.emit('ready-to-show');
  fixture.crop.rendererReady(window.webContents);
  const initialBounds = window.getBounds();

  // Electron can report the same setBounds call through both events. Neither
  // notification should turn the placement into a user drag.
  window.emit('move');
  window.emit('moved');

  assert.equal(fixture.crop.updateRegion({ x: 0.25, y: 0.6, width: 0.5, height: 0.2 }, display), true);
  const firstAutoPlacement = window.getBounds();
  assert.notDeepEqual(firstAutoPlacement, initialBounds);

  window.emit('move');
  window.emit('moved');

  assert.equal(fixture.crop.updateRegion({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, display), true);
  assert.deepEqual(window.getBounds(), {
    x: 144,
    y: 334,
    width: 480,
    height: 132,
  });
});

test('keeps a user-dragged placement when the selected region changes', () => {
  const fixture = createFixture();
  fixture.crop.show(configuration(), display);
  const window = fixture.windows[0];
  window.emit('ready-to-show');
  fixture.crop.rendererReady(window.webContents);

  // A native WebKit drag emits `moved`; the Crop Bar must use that placement
  // as its new base instead of jumping back to the region-derived position.
  window.setBounds({ x: 712, y: 620 });
  window.emit('moved');
  const draggedBounds = window.getBounds();

  assert.equal(fixture.crop.updateRegion({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, display), true);
  assert.deepEqual(window.getBounds(), draggedBounds);
});

test('commits a dragged position, restores it per display, and preserves it through region updates', () => {
  const fixture = createFixture(display, 'win32');
  fixture.crop.show(configuration(), display);
  const firstWindow = fixture.windows[0];
  firstWindow.emit('ready-to-show');
  fixture.crop.rendererReady(firstWindow.webContents);

  firstWindow.setBounds({ x: 640, y: 430 });
  firstWindow.emit('move');
  assert.equal(fixture.preferenceWrites.length, 0);
  firstWindow.emit('moved');
  assert.deepEqual(fixture.preferenceState.extras.quickSnipBarPositions, { 2: { x: 640, y: 430 } });

  fixture.crop.hide();
  fixture.crop.destroy();
  fixture.crop.show(configuration(), display);
  const restoredWindow = fixture.windows[1];
  assert.deepEqual(restoredWindow.getBounds(), { x: 640, y: 430, width: 480, height: 132 });
  const writesAfterRestore = fixture.preferenceWrites.length;

  fixture.crop.updateRegion({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, display);
  assert.deepEqual(restoredWindow.getBounds(), { x: 640, y: 430, width: 480, height: 132 });
  assert.equal(fixture.preferenceWrites.length, writesAfterRestore);
});

test('debounces Linux and macOS Crop Bar moves until the trailing 350ms commit', () => {
  for (const platform of ['linux', 'darwin']) {
    const fixture = createFixture(display, platform);
    fixture.crop.show(configuration(), display);
    const window = fixture.windows[0];
    window.emit('ready-to-show');
    fixture.crop.rendererReady(window.webContents);

    window.setBounds({ x: 650, y: 440 });
    window.emit('move');
    window.setBounds({ x: 660, y: 450 });
    window.emit('move');
    window.emit('moved');

    assert.equal(fixture.preferenceWrites.length, 0);
    assert.equal(fixture.timers.size, 1);
    const [timer] = fixture.timers.values();
    assert.equal(timer.delay, 350);
    timer.callback();
    assert.deepEqual(fixture.preferenceState.extras.quickSnipBarPositions, { 2: { x: 660, y: 450 } });
    assert.equal(fixture.preferenceWrites.length, 1);
  }
});

test('flushes a pending Crop Bar position before hide or destroy', () => {
  for (const lifecycle of ['hide', 'destroy']) {
    const fixture = createFixture(display, 'linux');
    fixture.crop.show(configuration(), display);
    const window = fixture.windows[0];
    window.emit('ready-to-show');
    fixture.crop.rendererReady(window.webContents);

    window.setBounds({ x: 600, y: 410 });
    window.emit('move');
    assert.equal(fixture.preferenceWrites.length, 0);
    assert.equal(fixture.timers.size, 1);

    fixture.crop[lifecycle]();

    assert.equal(fixture.timers.size, 0);
    assert.deepEqual(fixture.preferenceState.extras.quickSnipBarPositions, { 2: { x: 600, y: 410 } });
    assert.equal(fixture.preferenceWrites.length, 1);
  }
});

test('ignores the synthetic Wayland origin when committing a Crop Bar move', () => {
  const fixture = createFixture(display, 'linux', { environment: { WAYLAND_DISPLAY: 'wayland-0' } });
  fixture.crop.show(configuration(), display);
  const window = fixture.windows[0];
  window.emit('ready-to-show');
  fixture.crop.rendererReady(window.webContents);

  window.setBounds({ x: 0, y: 0 });
  window.emit('move');
  window.emit('moved');

  assert.equal(fixture.preferenceWrites.length, 0);
  assert.equal(fixture.timers.size, 0);
  fixture.crop.updateRegion({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, display);
  assert.deepEqual(window.getBounds(), { x: 144, y: 334, width: 480, height: 132 });
});

test('repositions the Crop Bar below the live selected region', () => {
  const fixture = createFixture();
  fixture.crop.show(configuration(), display);
  const window = fixture.windows[0];
  window.emit('ready-to-show');
  const initialBounds = window.getBounds();

  assert.equal(fixture.crop.updateRegion({ x: 0.25, y: 0.6, width: 0.5, height: 0.2 }, display), true);
  assert.notDeepEqual(window.getBounds(), initialBounds);
  assert.deepEqual(window.getBounds(), {
    x: 720,
    y: 874,
    width: 480,
    height: 132,
  });
});

test('cleans up the native window and makes later operations inert', () => {
  const fixture = createFixture();
  fixture.crop.show(configuration(), display);
  const window = fixture.windows[0];

  fixture.crop.destroy();

  assert.equal(window.destroyed, true);
  assert.equal(fixture.crop.nativeHandle(), null);
  assert.equal(fixture.crop.updateRegion(configuration().region, display), false);
});
