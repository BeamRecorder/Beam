const assert = require('node:assert/strict');
const test = require('node:test');

const { createQuickSnipStatusWindow } = require('../electron/quick-snip/quick-snip-status-window.cjs');

function createFixture() {
  const calls = [];
  const windows = [];
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
      this.destroyed = true;
      this.visible = false;
      calls.push(['destroy']);
      this.emit('closed');
    }
  }

  const matchingBounds = [];
  const status = createQuickSnipStatusWindow({
    BrowserWindow: FakeWindow,
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

  return { calls, windows, matchingBounds, capturedDisplay, primaryDisplay, status };
}

const processingStatus = {
  state: 'processing',
  progress: 0.4,
  job: { regionBounds: { x: 2200, y: 200, width: 800, height: 600 } },
};

test('places status on the bottom-right of the display that contains the capture', () => {
  const fixture = createFixture();
  fixture.status.update(processingStatus);

  const window = fixture.windows[0];
  assert.deepEqual(fixture.matchingBounds, [processingStatus.job.regionBounds]);
  assert.deepEqual(window.bounds, { x: 3124, y: 780, width: 380, height: 184 });
  assert.equal(window.visible, true);

  window.emit('ready-to-show');
  assert.deepEqual(
    fixture.calls.find((call) => call[0] === 'send'),
    ['send', 'quick-snip:status', processingStatus],
  );
});

test('compact mode resizes the status window and keeps it pinned to bottom-right', () => {
  const fixture = createFixture();
  fixture.status.update(processingStatus);
  const window = fixture.windows[0];
  const expandedPosition = { x: window.bounds.x, y: window.bounds.y };

  fixture.status.setCompact(true);
  assert.deepEqual(window.bounds, { x: 3124, y: 892, width: 380, height: 72 });
  assert.notDeepEqual({ x: window.bounds.x, y: window.bounds.y }, expandedPosition);
  assert.ok(fixture.calls.some((call) => call[0] === 'setSize' && call[1] === 380 && call[2] === 72));

  fixture.status.setCompact(false);
  assert.deepEqual(window.bounds, { x: 3124, y: 780, width: 380, height: 184 });
});

test('clears the existing status window without creating another one', () => {
  const fixture = createFixture();
  fixture.status.update(processingStatus);
  const window = fixture.windows[0];
  fixture.status.hide();

  assert.equal(window.destroyed, true);
  assert.equal(fixture.windows.length, 1);
  assert.deepEqual(fixture.calls.at(-1), ['destroy']);
});
