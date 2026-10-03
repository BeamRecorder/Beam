const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resizeHudPopover } = require('../apps/desktop/electron/window/hud-popover-size.cjs');
function fixture(y = 20, height = 268) {
  const calls = [];
  const win = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 20, y, width: 672, height }),
    setSize: (...args) => calls.push(args),
  };
  const screen = {
    getDisplayMatching: () => ({ workArea: { y: 0, height: 800 } }),
  };
  return { win, screen, calls };
}
test('expands only height and restores compact bounds without persisting menu size', () => {
  const f = fixture();
  assert.equal(resizeHudPopover(f.win, { mode: 'hud' }, f.screen, 420.2, 'darwin'), 421);
  assert.deepEqual(f.calls, [[672, 421]]);
  const expanded = fixture(20, 421);
  assert.equal(resizeHudPopover(expanded.win, { mode: 'hud' }, expanded.screen, 268, 'win32'), 268);
  assert.deepEqual(expanded.calls, [[672, 268]]);
});
test('caps menus at physical edges and the maximum allowed height', () => {
  const bottom = fixture(600);
  assert.equal(resizeHudPopover(bottom.win, { mode: 'hud' }, bottom.screen, 900, 'darwin'), 268);
  assert.deepEqual(bottom.calls, []);
  const top = fixture();
  assert.equal(resizeHudPopover(top.win, { mode: 'hud' }, top.screen, 1000, 'win32'), 720);
  assert.equal(resizeHudPopover(top.win, { mode: 'hud' }, top.screen, -2, 'win32'), 268);
});
test('Linux keeps its compact native bounds even if a renderer requests menu expansion', () => {
  const f = fixture(790);
  assert.equal(resizeHudPopover(f.win, { mode: 'hud' }, f.screen, 400, 'linux'), 268);
  assert.deepEqual(f.calls, []);
});
test('rejects invalid sizes and never resizes recorder, editor or disposed windows', () => {
  const f = fixture();
  for (const value of [NaN, Infinity, '420', null])
    assert.throws(() => resizeHudPopover(f.win, { mode: 'hud' }, f.screen, value), /Invalid/);
  for (const mode of ['recorder', 'editor', undefined])
    assert.equal(resizeHudPopover(f.win, { mode }, f.screen, 400), null);
  assert.equal(resizeHudPopover(null, null, f.screen, 400), null);
  f.win.isDestroyed = () => true;
  assert.equal(resizeHudPopover(f.win, { mode: 'hud' }, f.screen, 400), null);
  assert.deepEqual(f.calls, []);
});
