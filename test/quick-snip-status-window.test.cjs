const assert = require('node:assert/strict');
const test = require('node:test');

const { createQuickSnipStatusWindow } = require('../electron/quick-snip/quick-snip-status-window.cjs');

function createFixture(
  platform = 'win32',
  { cleanupStatus = () => {}, preferenceState = { extras: {} }, environment = {} } = {},
) {
  const timers = new Map();
  let timerId = 0;
  const calls = [];
  const windows = [];
  const preferenceWrites = [];
  const preferencesStore = {
    read: () => preferenceState,
    patch: ({ extras }) => {
      preferenceWrites.push(extras);
      for (const [key, value] of Object.entries(extras ?? {})) {
        preferenceState.extras[key] = { ...(preferenceState.extras[key] ?? {}), ...value };
      }
    },
  };
  const capturedDisplay = {
    id: 2,
    workArea: { x: 1920, y: 80, width: 1600, height: 900 },
  };
  const primaryDisplay = {
    id: 1,
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
  };

  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.bounds = { x: 0, y: 0, width: options.width, height: options.height };
      this.listeners = new Map();
      this.destroyed = false;
      this.visible = false;
      this._webContentsListeners = new Map();
      this._webContents = {
        on: (event, listener) => {
          this._webContentsListeners.set(event, listener);
        },
        once: (event, listener) => {
          this._webContentsListeners.set(event, (...args) => {
            this._webContentsListeners.delete(event);
            listener(...args);
          });
        },
        setZoomFactor: () => {},
        send: (...args) => calls.push(['send', ...args]),
      };
      Object.defineProperty(this, 'webContents', {
        enumerable: true,
        get: () => {
          if (this.destroyed) throw new TypeError('Object has been destroyed');
          return this._webContents;
        },
      });
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

    emitWebContents(event, ...args) {
      this._webContentsListeners.get(event)?.(...args);
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

    getSize() {
      return [this.bounds.width, this.bounds.height];
    }

    setPosition(x, y) {
      this.bounds = { ...this.bounds, x, y };
      calls.push(['setPosition', x, y]);
    }

    setSize(width, height) {
      this.bounds = { ...this.bounds, width, height };
      calls.push(['setSize', width, height]);
    }

    setIgnoreMouseEvents(...args) {
      calls.push(['ignoreMouse', ...args]);
    }

    setContentProtection(value) {
      calls.push(['contentProtection', value]);
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

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.visible = false;
      calls.push(['destroy']);
      this.emitWebContents('destroyed');
      this.emit('closed');
    }
  }

  const matchingBounds = [];
  const status = createQuickSnipStatusWindow({
    BrowserWindow: FakeWindow,
    platform,
    cleanupStatus,
    environment,
    preferencesStore,
    setTimer: (callback, delay) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    clearTimer: (id) => timers.delete(id),
    applicationRoot: '/app',
    isPackaged: false,
    appIconPath: '/app/icon.png',
    screen: {
      getDisplayMatching: (bounds) => {
        matchingBounds.push(bounds);
        return capturedDisplay;
      },
      getDisplayNearestPoint: () => primaryDisplay,
      getPrimaryDisplay: () => primaryDisplay,
      getCursorScreenPoint: () => ({ x: 100, y: 100 }),
    },
  });

  return {
    timers,
    calls,
    windows,
    matchingBounds,
    capturedDisplay,
    primaryDisplay,
    status,
    preferenceState,
    preferenceWrites,
  };
}

const processingStatus = {
  state: 'processing',
  progress: 0.4,
  job: { regionBounds: { x: 2200, y: 200, width: 800, height: 600 } },
};

test('shows only once ready and stays pinned without moving on progress', () => {
  const fixture = createFixture();
  fixture.status.update(processingStatus);
  const window = fixture.windows[0];
  assert.equal(window.visible, false);
  assert.equal(fixture.status.show(), true);
  assert.equal(window.visible, false);
  assert.equal(
    fixture.calls.some((call) => call[0] === 'setPosition'),
    false,
  );
  window.emit('ready-to-show');
  assert.deepEqual(window.bounds, { x: 3124, y: 780, width: 380, height: 184 });
  assert.equal(window.visible, true);
  const places = fixture.calls.filter((call) => call[0] === 'setPosition').length;
  fixture.status.update({ ...processingStatus, progress: 0.8 });
  fixture.status.setInteractive(true);
  fixture.status.setInteractive(false);
  assert.equal(fixture.calls.filter((call) => call[0] === 'setPosition').length, places);
  assert.equal(fixture.calls.filter((call) => call[0] === 'setSize').length, 0);
});

test('preserves a user-dragged position through show and status updates, then places a recreated window initially', () => {
  const fixture = createFixture();
  fixture.status.update(processingStatus);
  const original = fixture.windows[0];
  original.emit('ready-to-show');
  const initialPlacement = { ...original.bounds };
  const userPlacement = { ...initialPlacement, x: 2460, y: 260 };

  original.bounds = userPlacement;
  assert.equal(fixture.status.show(), true);
  fixture.status.update({ ...processingStatus, progress: 0.8 });
  fixture.status.update({ ...processingStatus, state: 'completed', progress: 1 });

  assert.deepEqual(original.bounds, userPlacement);
  assert.equal(fixture.calls.filter((call) => call[0] === 'setPosition').length, 1);

  fixture.status.hide();
  fixture.status.update({ ...processingStatus, progress: 0.2 });
  const recreated = fixture.windows[1];
  recreated.emit('ready-to-show');

  assert.deepEqual(recreated.bounds, initialPlacement);
  assert.equal(fixture.calls.filter((call) => call[0] === 'setPosition').length, 2);
});

test('saves the visible pill origin per display and flips below with 84px native compensation', () => {
  const fixture = createFixture('win32');
  fixture.status.update(processingStatus);
  const window = fixture.windows[0];
  window.emit('ready-to-show');
  const initialSize = window.getSize();
  fixture.calls.length = 0;

  // The previous layout placed details above the pill. Dragging the native window
  // to the work-area top flips details below while keeping the pill under the same point.
  window.bounds = { ...window.bounds, x: 2500, y: fixture.capturedDisplay.workArea.y };
  window.emit('move');
  window.emit('moved');

  assert.equal(fixture.status.snapshot().popoverSide, 'below');
  assert.deepEqual(window.getBounds(), { x: 2500, y: 164, width: 380, height: 184 });
  assert.deepEqual(fixture.preferenceState.extras.quickSnipStatusPositions, { 2: { x: 2512, y: 176 } });
  assert.equal(fixture.preferenceWrites.length, 1);
  assert.deepEqual(window.getSize(), initialSize);
  assert.deepEqual(
    fixture.calls.filter((call) => call[0] === 'setPosition'),
    [['setPosition', 2500, 164]],
  );
  assert.equal(window.getBounds().y - fixture.capturedDisplay.workArea.y, 84);

  const positionsAfterCommit = fixture.calls.filter((call) =>
    ['setPosition', 'setSize', 'showInactive', 'moveTop'].includes(call[0]),
  );
  fixture.status.update({ ...processingStatus, progress: 0.8 });
  assert.deepEqual(
    fixture.calls.filter((call) => ['setPosition', 'setSize', 'showInactive', 'moveTop'].includes(call[0])),
    positionsAfterCommit,
  );
});

test('restores a saved pill origin without rewriting it during presentation', () => {
  const preferenceState = { extras: { quickSnipStatusPositions: { 2: { x: 2100, y: 120 } } } };
  const fixture = createFixture('win32', { preferenceState });
  fixture.status.update(processingStatus);
  const window = fixture.windows[0];
  window.emit('ready-to-show');

  assert.deepEqual(fixture.preferenceState.extras.quickSnipStatusPositions, { 2: { x: 2100, y: 120 } });
  assert.equal(fixture.preferenceWrites.length, 0);
  assert.equal(fixture.status.snapshot().popoverSide, 'below');
  assert.deepEqual(window.getBounds(), { x: 2088, y: 108, width: 380, height: 184 });
});

test('debounces visible status-window moves and stores only the trailing macOS position', () => {
  const fixture = createFixture('darwin');
  fixture.status.update(processingStatus);
  const window = fixture.windows[0];
  window.emit('ready-to-show');

  window.bounds = { ...window.bounds, x: 2600, y: 400 };
  window.emit('move');
  window.bounds = { ...window.bounds, x: 2700, y: 450 };
  window.emit('move');
  window.emit('moved');

  assert.equal(fixture.preferenceWrites.length, 0);
  assert.equal(fixture.timers.size, 1);
  const [timer] = fixture.timers.values();
  assert.equal(timer.delay, 350);
  timer.callback();
  assert.equal(fixture.preferenceWrites.length, 1);
  assert.deepEqual(fixture.preferenceState.extras.quickSnipStatusPositions, { 2: { x: 2712, y: 546 } });
});

test('passes transparent pixels through on Windows and restores it after hover', () => {
  const fixture = createFixture();
  fixture.status.update(processingStatus);
  fixture.status.setInteractive(true);
  fixture.status.setInteractive(false);
  assert.deepEqual(
    fixture.calls.filter((call) => call[0] === 'ignoreMouse'),
    [
      ['ignoreMouse', true, { forward: true }],
      ['ignoreMouse', false, { forward: true }],
      ['ignoreMouse', true, { forward: true }],
    ],
  );
});

test('keeps Linux controls reachable without unsupported mouse forwarding', () => {
  const fixture = createFixture('linux');
  fixture.status.update(processingStatus);
  fixture.status.setInteractive(true);
  assert.equal(
    fixture.calls.some((call) => call[0] === 'ignoreMouse'),
    false,
  );
});

test('dismisses completed output after five seconds and pauses while interacting', () => {
  const fixture = createFixture();
  fixture.status.update({ ...processingStatus, state: 'completed' });
  fixture.windows[0].emit('ready-to-show');
  assert.equal([...fixture.timers.values()][0].delay, 5000);
  fixture.status.setInteractive(true);
  assert.equal(fixture.timers.size, 0);
  fixture.status.setInteractive(false);
  [...fixture.timers.values()][0].callback();
  assert.equal(fixture.windows[0].destroyed, true);
});

test('pauses completed dismissal while dragging and restarts the timer after position commit', () => {
  const fixture = createFixture('win32');
  fixture.status.update({ ...processingStatus, state: 'completed' });
  const window = fixture.windows[0];
  window.emit('ready-to-show');
  assert.equal(fixture.timers.size, 1);

  window.bounds = { ...window.bounds, x: 2500, y: fixture.capturedDisplay.workArea.y };
  window.emit('move');
  assert.equal(fixture.timers.size, 0);
  window.emit('moved');

  assert.equal(fixture.timers.size, 1);
  assert.equal([...fixture.timers.values()][0].delay, 5000);
  assert.equal(fixture.preferenceWrites.length, 1);
});

test('does not reset the dismissal deadline on duplicate status updates', () => {
  const fixture = createFixture();
  fixture.status.update({ ...processingStatus, state: 'completed' });
  fixture.windows[0].emit('ready-to-show');
  const timer = [...fixture.timers.keys()][0];
  fixture.status.update({ ...processingStatus, state: 'completed' });
  assert.equal([...fixture.timers.keys()][0], timer);
  fixture.status.hide();
  assert.equal(fixture.timers.size, 0);
});

test('leaves failures visible for recovery and rejects unrelated senders', () => {
  const fixture = createFixture();
  fixture.status.update({ ...processingStatus, state: 'failed' });
  fixture.windows[0].emit('ready-to-show');
  assert.equal(fixture.timers.size, 0);
  assert.equal(fixture.status.owns({}), false);
  assert.equal(fixture.status.owns(fixture.windows[0].webContents), true);
  fixture.status.hide();
  assert.equal(fixture.status.show(), false);
});

test('cleans the renderer exactly once with the live webContents reference', () => {
  const cleaned = [];
  const fixture = createFixture('win32', { cleanupStatus: (contents) => cleaned.push(contents) });
  fixture.status.update(processingStatus);
  const window = fixture.windows[0];
  const contents = window.webContents;

  assert.doesNotThrow(() => window.destroy());
  assert.throws(() => window.webContents, /Object has been destroyed/);
  assert.deepEqual(cleaned, [contents]);

  window.emitWebContents('destroyed');
  fixture.status.hide();
  assert.deepEqual(cleaned, [contents]);
});

test('ignores readiness that arrives after the status window closes', () => {
  const cleaned = [];
  const fixture = createFixture('win32', { cleanupStatus: (contents) => cleaned.push(contents) });
  fixture.status.update(processingStatus);
  const window = fixture.windows[0];
  const contents = window.webContents;

  assert.equal(window.visible, false);
  assert.doesNotThrow(() => window.emit('closed'));
  assert.equal(window.destroyed, true);
  assert.equal(fixture.status.show(), false);
  assert.doesNotThrow(() => window.emit('ready-to-show'));
  assert.equal(window.visible, false);
  assert.equal(fixture.calls.filter((call) => call[0] === 'showInactive').length, 0);
  assert.deepEqual(cleaned, [contents]);
});

test('reopening after early dismissal does not deliver an abandoned render task', () => {
  const fixture = createFixture();
  fixture.status.update(processingStatus);
  fixture.status.setRenderTask({ id: 'abandoned' });
  fixture.status.hide();
  fixture.status.update(processingStatus);
  fixture.windows[0].emit('ready-to-show');
  assert.equal(fixture.windows[1].visible, false);
  fixture.windows[1].emit('ready-to-show');
  assert.equal(fixture.windows[1].visible, true);
  assert.equal(
    fixture.calls.some((call) => call[1] === 'quick-snip:render-task'),
    false,
  );
});

test('clears a handed-off render task while keeping the status window alive', () => {
  const fixture = createFixture();
  fixture.status.update(processingStatus);
  const window = fixture.windows[0];
  window.emit('ready-to-show');

  const task = { id: 'render-1' };
  fixture.status.setRenderTask(task);
  fixture.status.setRenderTask(null);

  assert.deepEqual(
    fixture.calls.filter((call) => call[0] === 'send' && call[1] === 'quick-snip:render-task').map((call) => call[2]),
    [task, null],
  );
  assert.equal(window.destroyed, false);
  assert.equal(window.visible, true);
  assert.equal(fixture.windows.length, 1);
  assert.equal(fixture.status.owns(window.webContents), true);
  assert.equal(fixture.status.show(), true);
});

test('a render failure can present recovery without the old teardown closing it', () => {
  const fixture = createFixture();
  const failures = [];
  fixture.status.onRenderFailure((error) => {
    failures.push(error);
    fixture.status.update({ ...processingStatus, state: 'failed' });
  });
  fixture.status.update(processingStatus);
  const previous = fixture.windows[0];
  previous.emitWebContents('render-process-gone');
  assert.equal(failures.length, 1);
  assert.equal(previous.destroyed, true);
  const recovery = fixture.windows[1];
  previous.emit('ready-to-show');
  assert.equal(recovery.visible, false);
  recovery.emit('ready-to-show');
  assert.equal(recovery.visible, true);
  assert.equal(recovery.destroyed, false);
  fixture.status.hide();
  assert.equal(failures.length, 1);
});
