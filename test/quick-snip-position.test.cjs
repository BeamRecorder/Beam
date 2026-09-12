const assert = require('node:assert/strict');
const test = require('node:test');

const {
  placeCropBar,
  placeStatusPill,
  regionPixels,
  restoreWindowPosition,
  saveWindowPosition,
  statusPillPosition,
} = require('../electron/quick-snip/quick-snip-position.cjs');

const display = { x: 0, y: 0, width: 1920, height: 1080 };
const barSize = { width: 480, height: 132 };

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
    bounds: { x: 720, y: 658, width: 480, height: 132 },
    outside: true,
  });
});

test('places the Crop Bar above the selected region when below would exceed the work area', () => {
  const placement = placeCropBar({
    displayBounds: display,
    workArea: { x: 0, y: 0, width: 1920, height: 1000 },
    region: { x: 0.25, y: 0.82, width: 0.5, height: 0.04 },
    barSize,
    gap: 10,
  });

  assert.deepEqual(placement, {
    bounds: { x: 720, y: 744, width: 480, height: 132 },
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
    bounds: { x: 720, y: 868, width: 480, height: 132 },
    outside: false,
  });
});

test('keeps the Crop Bar fully inside a small work area when the selected region touches its edge', () => {
  const smallDisplay = { x: 0, y: 0, width: 640, height: 480 };
  const workArea = { x: 0, y: 0, width: 640, height: 480 };
  const placement = placeCropBar({
    displayBounds: smallDisplay,
    workArea,
    region: { x: 0.8, y: 0.85, width: 0.18, height: 0.15 },
    barSize,
    gap: 10,
  });

  assert.deepEqual(placement, {
    bounds: { x: 160, y: 266, width: 480, height: 132 },
    outside: true,
  });
  assert.ok(placement.bounds.x >= workArea.x);
  assert.ok(placement.bounds.y >= workArea.y);
  assert.ok(placement.bounds.x + placement.bounds.width <= workArea.x + workArea.width);
  assert.ok(placement.bounds.y + placement.bounds.height <= workArea.y + workArea.height);
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

test('restores saved positions on displays with negative origins and clamps to the work area', () => {
  const key = 'quickSnipPositions';
  const display = { id: 3, workArea: { x: -1600, y: -120, width: 1600, height: 900 } };
  const preferencesStore = {
    read: () => ({ extras: { [key]: { 3: { x: -4000, y: 1200 } } } }),
  };

  assert.deepEqual(restoreWindowPosition(preferencesStore, key, display, { width: 380, height: 184 }), {
    x: -1600,
    y: 596,
    width: 380,
    height: 184,
  });
});

test('returns no restored position for missing or invalid preference coordinates', () => {
  const key = 'quickSnipPositions';
  const display = { id: 4, workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
  const invalid = { read: () => ({ extras: { [key]: { 4: { x: '12', y: Number.NaN } } } }) };
  const missing = { read: () => ({ extras: {} }) };

  assert.equal(restoreWindowPosition(invalid, key, display, { width: 380, height: 184 }), null);
  assert.equal(restoreWindowPosition(missing, key, display, { width: 380, height: 184 }), null);
});

test('replaces an invalid per-display preference map when saving a position', () => {
  const key = 'quickSnipPositions';
  let state = { extras: { [key]: ['invalid-map'] } };
  const preferencesStore = {
    read: () => state,
    patch(value) {
      state = { ...state, extras: { ...state.extras, ...value.extras } };
    },
  };

  saveWindowPosition(preferencesStore, key, { id: 8 }, { x: -90, y: 42 });

  assert.deepEqual(state.extras[key], { 8: { x: -90, y: 42 } });
});

test('clamps a restored window to the origin when the display is smaller than the window', () => {
  const key = 'quickSnipPositions';
  const display = { id: 5, workArea: { x: -40, y: 30, width: 320, height: 160 } };
  const preferencesStore = {
    read: () => ({ extras: { [key]: { 5: { x: 200, y: -100 } } } }),
  };

  assert.deepEqual(restoreWindowPosition(preferencesStore, key, display, { width: 380, height: 184 }), {
    x: -40,
    y: 30,
    width: 380,
    height: 184,
  });
});

test('saves rounded positions per display and skips duplicate coordinates', () => {
  const key = 'quickSnipPositions';
  let state = { extras: { [key]: { 1: { x: 10, y: 20 } }, untouched: { enabled: true } } };
  const patches = [];
  const preferencesStore = {
    read: () => state,
    patch(value) {
      patches.push(value);
      state = { ...state, extras: { ...state.extras, ...value.extras } };
    },
  };

  saveWindowPosition(preferencesStore, key, { id: 1 }, { x: 10.2, y: 20.3 });
  assert.equal(patches.length, 0);

  saveWindowPosition(preferencesStore, key, { id: 1 }, { x: 14.6, y: 25.2 });
  saveWindowPosition(preferencesStore, key, { id: 1 }, { x: 15.1, y: 24.8 });
  saveWindowPosition(preferencesStore, key, { id: 2 }, { x: -200.4, y: 40.6 });

  assert.equal(patches.length, 2);
  assert.deepEqual(state.extras[key], {
    1: { x: 15, y: 25 },
    2: { x: -200, y: 41 },
  });
  assert.deepEqual(state.extras.untouched, { enabled: true });
});

test('places details below the status pill near the top edge, including negative screen origins', () => {
  const workArea = { x: -1600, y: -200, width: 1600, height: 1000 };
  const placement = placeStatusPill({ position: { x: -5000, y: -5000 }, workArea });

  assert.deepEqual(placement, {
    bounds: { x: -1600, y: -200, width: 380, height: 184 },
    popoverSide: 'below',
    position: { x: -1588, y: -188 },
  });
  assert.deepEqual(statusPillPosition(placement.bounds, placement.popoverSide), placement.position);
});

test('flips details from above to below without moving a valid pill anchor', () => {
  const workArea = { x: 0, y: 0, width: 1000, height: 400 };
  const previousBounds = { x: 108, y: 0, width: 380, height: 184 };
  const pillPosition = statusPillPosition(previousBounds, 'above');

  assert.deepEqual(pillPosition, { x: 120, y: 96 });

  const placement = placeStatusPill({ position: pillPosition, workArea });

  assert.equal(placement.popoverSide, 'below');
  assert.deepEqual(placement.bounds, { x: 108, y: 84, width: 380, height: 184 });
  assert.deepEqual(placement.position, pillPosition);
});

test('places details above near the bottom edge and compensates to keep the pill at its requested position', () => {
  const workArea = { x: -1600, y: -200, width: 1600, height: 1000 };
  const requested = { x: 5000, y: 5000 };
  const placement = placeStatusPill({ position: requested, workArea });

  assert.equal(placement.popoverSide, 'above');
  assert.deepEqual(placement.bounds, { x: -380, y: 616, width: 380, height: 184 });
  assert.deepEqual(placement.position, { x: -368, y: 712 });
  assert.deepEqual(statusPillPosition(placement.bounds, placement.popoverSide), placement.position);
  assert.ok(placement.bounds.x >= workArea.x);
  assert.ok(placement.bounds.y >= workArea.y);
  assert.ok(placement.bounds.x + placement.bounds.width <= workArea.x + workArea.width);
  assert.ok(placement.bounds.y + placement.bounds.height <= workArea.y + workArea.height);
});

test('rejects invalid status work area or pill position', () => {
  assert.throws(
    () => placeStatusPill({ position: { x: 0, y: 0 }, workArea: { x: 0, y: 0, width: 0, height: 100 } }),
    /geometry is invalid/,
  );
  assert.throws(() => placeStatusPill({ position: { x: Number.NaN, y: 0 }, workArea: display }), /geometry is invalid/);
});
