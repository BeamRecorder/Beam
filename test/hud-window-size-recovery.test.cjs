const assert = require('node:assert/strict');
const test = require('node:test');
const { restoreHudWindowSize, normalizeHudWindowSize } = require('../apps/desktop/electron/window/hud-window-size.cjs');

function fixture(width, height, destroyed = false) {
  const calls = [];
  const window = {
    isDestroyed: () => destroyed,
    getBounds: () => ({ width, height }),
    setSize: (...size) => calls.push(size),
  };
  return { window, calls };
}

test('repairs a full display width while preserving an open popover', () => {
  for (const height of [268, 420, 720]) {
    const f = fixture(2560, height);
    restoreHudWindowSize(f.window, 'hud');
    assert.deepEqual(f.calls, [[672, height]]);
  }
});

test('bounds unexpected native heights and leaves correct sizes alone', () => {
  for (const [height, expected] of [
    [1440, 720],
    [88, 268],
  ]) {
    const f = fixture(672, height);
    restoreHudWindowSize(f.window, 'hud');
    assert.deepEqual(f.calls, [[672, expected]]);
  }
  const f = fixture(672, 420);
  restoreHudWindowSize(f.window, 'hud');
  assert.deepEqual(f.calls, []);
});

test('never resizes another mode or a destroyed window', () => {
  for (const mode of ['recorder', 'preparation', 'editor']) {
    const f = fixture(800, 88);
    restoreHudWindowSize(f.window, mode);
    assert.deepEqual(f.calls, []);
  }
  const f = fixture(2560, 1440, true);
  restoreHudWindowSize(f.window, 'hud');
  assert.deepEqual(f.calls, []);
});

test('normalizes missing, stale and canonical stored HUD dimensions', () => {
  for (const value of [undefined, null, {}, { width: 2560, height: 1440 }]) {
    assert.deepEqual(normalizeHudWindowSize(value), { width: 672, height: 268 });
  }
  const stored = { width: 672, height: 268 };
  assert.deepEqual(normalizeHudWindowSize(stored), stored);
  assert.notEqual(normalizeHudWindowSize(stored), stored);
});

test('recovery preserves a deliberately resized HUD width and base height', () => {
  const f = fixture(2560, 300);
  restoreHudWindowSize(f.window, 'hud', { width: 900, height: 400 });
  assert.deepEqual(f.calls, [[900, 400]]);
});
