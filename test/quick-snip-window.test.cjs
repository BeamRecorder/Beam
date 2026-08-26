const assert = require('node:assert/strict');
const test = require('node:test');

const { createQuickSnipWindow } = require('../electron/quick-snip/quick-snip-window.cjs');

const display = {
  id: 2,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
};

function createFixture(targetDisplay = display, platform = 'linux') {
  const calls = [];
  const windows = [];

  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.bounds = { x: 0, y: 0, width: options.width, height: options.height };
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
    screen: {
      getDisplayMatching: () => targetDisplay,
    },
  });

  return { calls, windows, crop };
}

function configuration() {
  return {
    mode: 'studio',
    format: 'mp4',
    region: { x: 0.25, y: 0.2, width: 0.5, height: 0.3 },
  };
}

test('shows the Crop Bar immediately while the region selection is still pending', () => {
  const fixture = createFixture();
  fixture.crop.show(configuration(), display);

  const window = fixture.windows[0];
  assert.equal(window.visible, true);
  assert.deepEqual(window.getBounds(), { x: 580, y: 550, width: 760, height: 84 });
  assert.equal(
    fixture.calls.some((call) => call[0] === 'showInactive'),
    true,
  );

  window.emit('ready-to-show');
  const configureCall = fixture.calls.find((call) => call[0] === 'send' && call[1] === 'quick-snip:configure');
  assert.equal(configureCall[2].mode, 'studio');
  assert.equal(configureCall[2].excludedWindowHandle, '717569636b2d736e69702d77696e646f77');
});

test('keeps the Crop Bar visible when recording visibility toggles outside Linux auto-hide mode', () => {
  const fixture = createFixture(display, 'darwin');
  fixture.crop.show(configuration(), display);
  const window = fixture.windows[0];

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
  const selectionOverlay = { id: 'selection-overlay' };

  fixture.crop.setParentWindow(selectionOverlay);
  assert.deepEqual(fixture.calls.at(-1), ['parent', selectionOverlay]);

  fixture.crop.setParentWindow(null);
  assert.deepEqual(fixture.calls.at(-1), ['parent', null]);
});

test('keeps a user-dragged placement when the selected region changes', () => {
  const fixture = createFixture();
  fixture.crop.show(configuration(), display);
  const window = fixture.windows[0];
  window.emit('ready-to-show');

  // A native WebKit drag emits `moved`; the Crop Bar must use that placement
  // as its new base instead of jumping back to the region-derived position.
  window.setBounds({ x: 712, y: 620 });
  window.emit('moved');
  const draggedBounds = window.getBounds();

  assert.equal(fixture.crop.updateRegion({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, display), true);
  assert.deepEqual(window.getBounds(), draggedBounds);
});

test('repositions the Crop Bar below the live selected region', () => {
  const fixture = createFixture();
  fixture.crop.show(configuration(), display);
  const window = fixture.windows[0];
  window.emit('ready-to-show');
  const initialBounds = window.getBounds();

  assert.equal(fixture.crop.updateRegion({ x: 0.25, y: 0.6, width: 0.5, height: 0.2 }, display), true);
  assert.notDeepEqual(window.getBounds(), initialBounds);
  assert.deepEqual(window.getBounds(), { x: 580, y: 874, width: 760, height: 84 });
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
