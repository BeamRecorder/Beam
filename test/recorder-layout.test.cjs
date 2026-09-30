const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeRecorderLayout,
  bottomCenterRecorder,
  RECORDER_SIZE,
} = require('../electron/window/recorder-layout.cjs');

test('resets every legacy recorder position once while preserving unrelated settings', () => {
  const legacy = {
    recorderPositions: { a: { x: 100, y: 400 }, b: { x: -900, y: 10 } },
    lastRecorderPosition: { x: 12, y: 32 },
    quickSnipBarPositions: { a: { x: 10, y: 10 } },
    cameraOverlay: { x: 50, y: 60 },
    locale: 'fr',
  };
  const next = normalizeRecorderLayout(legacy);
  assert.deepEqual(next.recorderPositions, {});
  assert.deepEqual(next.quickSnipBarPositions, {});
  assert.equal(next.lastRecorderPosition, undefined);
  assert.equal(next.recorderLayoutVersion, 1);
  assert.deepEqual(next.cameraOverlay, legacy.cameraOverlay);
  assert.equal(next.locale, 'fr');
  assert.ok(legacy.lastRecorderPosition);
});
test('preserves new user placements on subsequent normalization', () => {
  const extras = {
    recorderLayoutVersion: 1,
    recorderPositions: { left: { x: -800, y: 0 } },
    quickSnipBarPositions: { right: { x: 2200, y: 200 } },
  };
  assert.deepEqual(normalizeRecorderLayout(extras), extras);
  assert.deepEqual(normalizeRecorderLayout(normalizeRecorderLayout(extras)), extras);
});
test('initializes missing or malformed position settings for new installations', () => {
  for (const value of [undefined, null, [], 'invalid'])
    assert.deepEqual(normalizeRecorderLayout(value), {
      recorderPositions: {},
      quickSnipBarPositions: {},
      recorderLayoutVersion: 1,
    });
});
test('centers the horizontal bar above the taskbar on every display, including negative origins', () => {
  for (const area of [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: -1920, y: -400, width: 1920, height: 1080 },
    { x: 1920, y: 50, width: 2560, height: 1400 },
  ]) {
    const bounds = bottomCenterRecorder(area);
    assert.deepEqual({ width: bounds.width, height: bounds.height }, RECORDER_SIZE);
    assert.equal(bounds.x, area.x + (area.width - RECORDER_SIZE.width) / 2);
    assert.equal(bounds.y + bounds.height, area.y + area.height - 16);
  }
});
test('keeps the origin reachable when the work area is smaller than the recorder', () => {
  assert.deepEqual(bottomCenterRecorder({ x: -100, y: 20, width: 200, height: 80 }), {
    x: -100,
    y: 20,
    ...RECORDER_SIZE,
  });
});
test('rounds a centered position on displays with odd pixel dimensions', () => {
  assert.deepEqual(bottomCenterRecorder({ x: 0, y: 0, width: 1001, height: 801 }), {
    x: 325,
    y: 697,
    ...RECORDER_SIZE,
  });
});
