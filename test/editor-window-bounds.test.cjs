const assert = require('node:assert/strict');
const test = require('node:test');
const {
  EDITOR_DEFAULT_SIZE,
  EDITOR_MIN_SIZE,
  editorWindowBounds,
} = require('../apps/desktop/electron/window/editor-window-bounds.cjs');

test('fits a 1920x1080 display at 150% without multiplying Electron logical pixels', () => {
  assert.deepEqual(editorWindowBounds(null, { x: 0, y: 0, width: 1280, height: 680 }), {
    x: 0,
    y: 0,
    width: 1280,
    height: 680,
    minWidth: 960,
    minHeight: 600,
  });
});
test('restores a large saved window within a smaller or differently scaled display', () => {
  assert.deepEqual(editorWindowBounds({ width: 2560, height: 1440 }, { x: -1280, y: 80, width: 1280, height: 680 }), {
    x: -1280,
    y: 80,
    width: 1280,
    height: 680,
    minWidth: 960,
    minHeight: 600,
  });
});
test('reduces native minimum dimensions when a scaled display is smaller than them', () => {
  assert.deepEqual(editorWindowBounds(null, { x: 0, y: 0, width: 900, height: 540 }), {
    x: 0,
    y: 0,
    width: 900,
    height: 540,
    minWidth: 900,
    minHeight: 540,
  });
});
test('centers a valid saved size on its selected display instead of the primary display', () => {
  assert.deepEqual(editorWindowBounds({ width: 1000, height: 650 }, { x: 1920, y: -200, width: 1600, height: 1000 }), {
    x: 2220,
    y: -25,
    width: 1000,
    height: 650,
    minWidth: 960,
    minHeight: 600,
  });
});
test('cascades independent editors while keeping their complete bounds in the work area', () => {
  const area = { x: -1600, y: 0, width: 1600, height: 1000 };
  assert.deepEqual(editorWindowBounds(null, area, { x: -1590, y: 10 }), {
    x: -1566,
    y: 34,
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
  });
  assert.deepEqual(editorWindowBounds(null, area, { x: -10, y: 990 }), {
    x: -1280,
    y: 200,
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
  });
  assert.equal(editorWindowBounds(null, area, { x: -2000, y: -100 }).x, -1600);
});
test('rejects malformed native work areas', () => {
  for (const area of [
    { x: 0, y: 0, width: 0, height: 720 },
    { x: 0, y: 0, width: 1280, height: -1 },
    { x: NaN, y: 0, width: 1280, height: 720 },
    { x: 0, y: 0, width: Infinity, height: 720 },
  ])
    assert.throws(() => editorWindowBounds(null, area), /invalid work area/);
});
test('ignores invalid persisted dimensions and retains valid independently saved dimensions', () => {
  for (const value of [undefined, -1, 0, 10, '1400', NaN, Infinity]) {
    assert.deepEqual(editorWindowBounds({ width: value, height: value }), {
      ...EDITOR_DEFAULT_SIZE,
      minWidth: EDITOR_MIN_SIZE.width,
      minHeight: EDITOR_MIN_SIZE.height,
    });
  }
  assert.deepEqual(editorWindowBounds({ width: 1400.4, height: 900.6 }), {
    width: 1400,
    height: 901,
    minWidth: 960,
    minHeight: 600,
  });
  assert.equal(editorWindowBounds({ width: 1500 }).height, 800);
  assert.equal(editorWindowBounds(null, null, { x: 10, y: 20 }).x, 34);
});
