const assert = require('node:assert/strict');
const test = require('node:test');
const { resizedBounds, registerHudResizeIpc } = require('../apps/desktop/electron/window/hud-resize.cjs');
const bounds = { x: 300, y: 200, width: 800, height: 400 };
const area = { x: 0, y: 0, width: 2560, height: 1440 };

test('all edges resize on their axes and preserve the opposite anchor', () => {
  for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const next = resizedBounds(bounds, edge, 20, 30, area);
    assert.equal(next.width, edge.includes('w') ? 780 : edge.includes('e') ? 820 : 800);
    assert.equal(next.height, edge.includes('n') ? 370 : edge.includes('s') ? 430 : 400);
    assert.equal(next.x, edge.includes('w') ? 320 : 300);
    assert.equal(next.y, edge.includes('n') ? 230 : 200);
  }
});
test('limits custom dimensions and keeps them on the selected display', () => {
  assert.deepEqual(resizedBounds(bounds, 'se', -1000, -1000, area), { ...bounds, width: 672, height: 268 });
  const next = resizedBounds(bounds, 'nw', -10000, -10000, area);
  assert.deepEqual(next, { x: 0, y: 0, width: 1200, height: 720 });
});
test('handles negative display coordinates, small work areas and fractional movement', () => {
  const next = resizedBounds({ ...bounds, x: -1000 }, 'se', 500.2, 500.2, { x: -1280, y: 0, width: 1000, height: 600 });
  assert.deepEqual(next, { x: -1280, y: 0, width: 1000, height: 600 });
});
function fixture() {
  let callback;
  let pointer = { x: 500, y: 300 };
  const calls = [];
  const win = { isDestroyed: () => false, getBounds: () => bounds, setBounds: (value) => calls.push(value) };
  const controller = { mode: 'hud', hudSize: { width: 800, height: 400 } };
  registerHudResizeIpc(
    {
      handle: (_, fn) => {
        callback = fn;
      },
    },
    (event) => (event.sender === win ? win : null),
    (window) => (window === win ? controller : null),
    { getCursorScreenPoint: () => pointer, getDisplayMatching: () => ({ workArea: area }) },
  );
  return {
    controller,
    win,
    calls,
    pointer: (value) => {
      pointer = value;
    },
    request: (edge, phase, sender = win) => callback({ sender }, edge, phase),
  };
}
test('owned gesture uses native cursor positions and commits the chosen base dimensions', () => {
  const f = fixture();
  assert.deepEqual(f.request(null, 'read'), { width: 800, height: 400 });
  f.request('se', 'start');
  f.pointer({ x: 600, y: 350 });
  assert.deepEqual(f.request(null, 'move'), { width: 900, height: 450 });
  assert.deepEqual(f.controller.userHudSize, { width: 900, height: 450 });
  assert.equal(f.calls.length, 1);
  f.request(null, 'end');
  assert.equal(f.request(null, 'move'), null);
});
test('rejects invalid resize requests and ignores unowned windows and other modes', () => {
  const f = fixture();
  assert.throws(() => f.request('bogus', 'start'), /edge/);
  assert.throws(() => f.request(null, 'bogus'), /phase/);
  assert.equal(f.request('se', 'start', {}), null);
  for (const mode of ['recorder', 'preparation']) {
    f.controller.mode = mode;
    assert.equal(f.request('se', 'start'), null);
  }
  f.controller.mode = 'hud';
  f.win.isDestroyed = () => true;
  assert.equal(f.request('se', 'start'), null);
  assert.deepEqual(f.calls, []);
});
test('move without a started gesture is inert; a new start replaces old geometry', () => {
  const f = fixture();
  assert.equal(f.request(null, 'move'), null);
  f.request('se', 'start');
  f.request('w', 'start');
  f.pointer({ x: 550, y: 350 });
  assert.deepEqual(f.request(null, 'move'), { width: 750, height: 400 });
});
