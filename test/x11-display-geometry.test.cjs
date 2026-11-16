const assert = require('node:assert/strict');
const test = require('node:test');
const { x11DipBounds } = require('../apps/desktop/electron/capture/x11-display-geometry.cjs');
const screen = {
  getAllDisplays: () => [
    { nativeOrigin: { x: -2560, y: 0 }, bounds: { x: -1280, y: 0, width: 1280, height: 720 }, scaleFactor: 2 },
    { nativeOrigin: { x: 0, y: 0 }, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
  ],
};
test('X11 physical monitor bounds preserve negative origins and display scale', () => {
  assert.deepEqual(x11DipBounds(screen, { x: -2560, y: 0, width: 2560, height: 1440 }), {
    x: -1280,
    y: 0,
    width: 1280,
    height: 720,
  });
});
test('X11 windows on mixed-DPI monitors use the containing physical display', () => {
  assert.deepEqual(x11DipBounds(screen, { x: -2400, y: 100, width: 800, height: 600 }), {
    x: -1200,
    y: 50,
    width: 400,
    height: 300,
  });
  assert.deepEqual(x11DipBounds(screen, { x: 40, y: 60, width: 800, height: 600 }), {
    x: 40,
    y: 60,
    width: 800,
    height: 600,
  });
});
test('X11 invalid or unmatched geometry fails explicitly', () => {
  for (const bounds of [null, {}, { x: NaN, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 0, height: 1 }])
    assert.throws(() => x11DipBounds(screen, bounds), /invalid/);
  assert.throws(() => x11DipBounds(screen, { x: 9000, y: 0, width: 10, height: 10 }), /matched/);
});
