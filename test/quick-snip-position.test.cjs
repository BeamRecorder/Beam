const assert = require('node:assert/strict');
const test = require('node:test');

const { placeCropBar, regionPixels } = require('../electron/quick-snip/quick-snip-position.cjs');

const display = { x: 0, y: 0, width: 1920, height: 1080 };
const barSize = { width: 760, height: 84 };

test('converts a normalized region to display pixels', () => {
  assert.deepEqual(regionPixels(display, { x: 0.25, y: 0.2, width: 0.5, height: 0.4 }), {
    x: 480,
    y: 216,
    width: 960,
    height: 432,
  });
});

test('places the Crop Bar below the selected region when the work area has room', () => {
  const placement = placeCropBar({
    displayBounds: display,
    workArea: display,
    region: { x: 0.25, y: 0.2, width: 0.5, height: 0.4 },
    barSize,
    gap: 10,
  });

  assert.deepEqual(placement, {
    bounds: { x: 580, y: 658, width: 760, height: 84 },
    outside: true,
  });
});

test('places the Crop Bar above the selected region when below would exceed the work area', () => {
  const placement = placeCropBar({
    displayBounds: display,
    workArea: { x: 0, y: 0, width: 1920, height: 1000 },
    region: { x: 0.25, y: 0.95, width: 0.5, height: 0.04 },
    barSize,
    gap: 10,
  });

  assert.deepEqual(placement, {
    bounds: { x: 580, y: 932, width: 760, height: 84 },
    outside: true,
  });
});

test('clamps an unavoidable Linux overlap inside the work area', () => {
  const placement = placeCropBar({
    displayBounds: display,
    workArea: { x: 0, y: 0, width: 1920, height: 1000 },
    region: { x: 0, y: 0, width: 1, height: 1 },
    barSize,
    gap: 10,
  });

  assert.deepEqual(placement, {
    bounds: { x: 580, y: 916, width: 760, height: 84 },
    outside: false,
  });
});

test('rejects invalid display or Crop Bar geometry', () => {
  assert.throws(
    () =>
      placeCropBar({
        displayBounds: { ...display, width: 0 },
        workArea: display,
        region: { x: 0, y: 0, width: 1, height: 1 },
        barSize,
      }),
    /geometry is invalid/,
  );
  assert.throws(
    () =>
      placeCropBar({
        displayBounds: display,
        workArea: display,
        region: { x: 0, y: 0, width: 1, height: 1 },
        barSize: { width: 0, height: barSize.height },
      }),
    /geometry is invalid/,
  );
});
