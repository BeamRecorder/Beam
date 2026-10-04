const assert = require('node:assert/strict');
const test = require('node:test');
const { regionRecordingSettings } = require('../apps/desktop/electron/region-selection-settings.cjs');
const { markerBounds, createRegionRecordingMarker } = require('../apps/desktop/electron/region-recording-marker.cjs');
const {
  regionRectangle,
  placeOutsideRegion,
} = require('../apps/desktop/electron/teleprompter/teleprompter-region.cjs');
const { captureWindowExclusions } = require('../apps/desktop/electron/capture/capture-window-exclusions.cjs');
const bounds = { x: -1000, y: 0, width: 1000, height: 800 };
const region = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
const settings = {
  cameraId: 'off',
  microphoneId: 'no-audio',
  systemAudio: true,
  countdownSeconds: 3,
  hideTaskbar: true,
  hideDesktopIcons: true,
  showRealCursor: true,
};
test('settings accepts every countdown from zero to ten and strips extra IPC data', () => {
  for (let countdownSeconds = 0; countdownSeconds <= 10; countdownSeconds++)
    assert.deepEqual(regionRecordingSettings({ ...settings, countdownSeconds, arbitrary: 1 }, 'win32'), {
      ...settings,
      countdownSeconds,
    });
  assert.deepEqual(regionRecordingSettings(settings, 'darwin'), settings);
  assert.equal(regionRecordingSettings(null, 'linux'), undefined);
});
test('Linux settings explicitly disable unavailable shell hiding', () => {
  assert.deepEqual(regionRecordingSettings(settings, 'linux'), {
    ...settings,
    hideTaskbar: false,
    hideDesktopIcons: false,
  });
});
for (const zoomMode of ['off', '2d', '3d', 'glass'])
  test(`accepts the ${zoomMode} region zoom algorithm through IPC`, () => {
    const next = { ...settings, zoomMode };
    assert.deepEqual(regionRecordingSettings(next, 'win32'), next);
  });
test('settings rejects malformed IPC values', () => {
  for (const value of [
    false,
    1,
    'settings',
    {},
    { ...settings, cameraId: '' },
    { ...settings, microphoneId: 'a'.repeat(257) },
    ...['4d', '', null, 1, {}].map((zoomMode) => ({ ...settings, zoomMode })),
    ...[-1, 11, 0.5, NaN, '3'].map((countdownSeconds) => ({
      ...settings,
      countdownSeconds,
    })),
    ...['systemAudio', 'hideTaskbar', 'hideDesktopIcons', 'showRealCursor'].map((key) => ({
      ...settings,
      [key]: 1,
    })),
  ])
    assert.throws(() => regionRecordingSettings(value, 'win32'), TypeError);
});
test('marker strips stay entirely outside the selected crop on offset displays', () => {
  const crop = regionRectangle({ bounds, region });
  const strips = markerBounds(bounds, region);
  assert.equal(strips.length, 4);
  for (const strip of strips) {
    assert.ok(strip.x >= bounds.x && strip.y >= bounds.y);
    assert.ok(strip.x + strip.width <= bounds.x + bounds.width);
    assert.ok(strip.y + strip.height <= bounds.y + bounds.height);
    assert.ok(
      strip.x + strip.width <= crop.x ||
        strip.x >= crop.x + crop.width ||
        strip.y + strip.height <= crop.y ||
        strip.y >= crop.y + crop.height,
    );
  }
});
test('marker omits screen edges and leaves a full screen capture unobstructed', () => {
  assert.equal(markerBounds(bounds, { x: 0, y: 0, width: 1, height: 1 }).length, 0);
  assert.equal(markerBounds(bounds, { x: 0, y: 0, width: 0.5, height: 0.5 }).length, 2);
  assert.equal(markerBounds(bounds, { x: 0.1, y: 0.1, width: 0.899, height: 0.899 }).length, 2);
});
function markerHarness(load = () => Promise.resolve()) {
  const windows = [];
  class BrowserWindow {
    constructor(options) {
      this.options = options;
      this.webContents = {};
      this.destroyed = false;
      this.shown = false;
      windows.push(this);
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
      this.closed?.();
    }
    on(event, callback) {
      if (event === 'closed') this.closed = callback;
    }
    setIgnoreMouseEvents(value) {
      this.ignored = value;
    }
    showInactive() {
      this.shown = true;
    }
    loadURL(url) {
      this.url = url;
      return load();
    }
    loadFile(file) {
      this.url = file;
      return load();
    }
  }
  return {
    windows,
    marker: createRegionRecordingMarker({
      BrowserWindow,
      applicationRoot: '/app',
      isPackaged: false,
      platform: 'linux',
    }),
  };
}
test('markers wait for their own themed renderer and do not take focus or clicks', () => {
  const { marker, windows } = markerHarness();
  marker.show(bounds, region);
  assert.equal(marker.ready({}), false);
  assert.equal(windows.length, 4);
  assert.equal(windows[0].shown, false);
  assert.equal(marker.ready(windows[0].webContents), true);
  assert.equal(windows[0].shown, true);
  assert.equal(windows[0].ignored, true);
  assert.equal(windows[0].options.focusable, false);
  marker.hide();
  assert.ok(windows.every((window) => window.destroyed));
  assert.equal(marker.ready(windows[0].webContents), false);
});
test('new marker bounds dispose the old strips and failed loads cannot leave native windows', async () => {
  const { marker, windows } = markerHarness(() => Promise.reject(new Error('load failed')));
  marker.show(bounds, region);
  marker.show(bounds, region);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(windows.every((window) => window.destroyed));
  marker.hide();
});
test('teleprompter geometry uses global display coordinates and rejects invalid crops', () => {
  assert.deepEqual(regionRectangle({ bounds, region }), {
    x: -750,
    y: 200,
    width: 500,
    height: 400,
  });
  for (const value of [
    null,
    { bounds, region: null },
    { bounds: { ...bounds, width: 0 }, region },
    ...[{ x: -0.1 }, { width: 0 }, { y: NaN }, { x: 0.9 }].map((invalid) => ({
      bounds,
      region: { ...region, ...invalid },
    })),
  ])
    assert.throws(() => regionRectangle(value), /Invalid/);
});
test('teleprompter preserves an already safe window and moves an overlapping one outside the crop', () => {
  const safe = { x: -990, y: 20, width: 300, height: 140 };
  const options = { bounds, region };
  const displays = [{ bounds }];
  assert.equal(placeOutsideRegion(safe, options, displays), safe);
  const moved = placeOutsideRegion({ x: -700, y: 300, width: 600, height: 400 }, options, displays);
  assert.ok(moved.y + moved.height <= 184 || moved.y >= 616);
  assert.ok(moved.width <= 1000 && moved.height <= 184);
});
test('full display capture needs another display to keep the Linux teleprompter invisible', () => {
  const options = { bounds, region: { x: 0, y: 0, width: 1, height: 1 } };
  const window = { x: -700, y: 300, width: 400, height: 250 };
  assert.throws(() => placeOutsideRegion(window, options, [{ bounds }]), /smaller or use another display/);
  const moved = placeOutsideRegion(window, options, [{ bounds }, { bounds: { ...bounds, x: 0 } }]);
  assert.ok(moved.x >= 16);
  assert.equal(moved.width, 400);
});
test('macOS explicitly excludes only Beam auxiliary native windows', () => {
  const urls = [
    'https://app/html/teleprompter.html',
    'https://app/html/countdown.html',
    'https://app/?cameraOverlay=1',
    'https://app/html/screen-region.html',
    'https://app/html/editor.html',
    'https://app/?screenRegion=10',
  ];
  const BrowserWindow = {
    getAllWindows: () =>
      urls.map((url, index) => ({
        isDestroyed: () => false,
        webContents: { getURL: () => url },
        getMediaSourceId: () => `window:${index + 1}:0`,
      })),
  };
  assert.deepEqual(captureWindowExclusions(BrowserWindow, 'win32'), []);
  assert.deepEqual(captureWindowExclusions(BrowserWindow, 'linux'), []);
  assert.deepEqual(captureWindowExclusions(BrowserWindow, 'darwin'), ['1', '2', '3', '4']);
});
