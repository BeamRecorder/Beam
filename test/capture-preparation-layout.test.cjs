const assert = require('node:assert/strict');
const test = require('node:test');
const { fitPreparationBar } = require('../apps/desktop/electron/window/capture-preparation-layout.cjs');
function fixture(area = { x: 0, y: 0, width: 1920, height: 1080 }) {
  const calls = [];
  let bounds = { x: 560, y: 900, width: 800, height: 88 };
  const controller = {
    window: {
      getBounds: () => bounds,
      setMinimumSize: (...size) => calls.push(size),
      setBounds: (next) => {
        bounds = next;
        calls.push(next);
      },
    },
  };
  const fit = (width) => fitPreparationBar(controller, { getDisplayMatching: () => ({ workArea: area }) }, width);
  return { fit, calls, controller, bounds: () => bounds };
}
test('shrinks to the measured content plus shadow margins, keeping its center and height', () => {
  const f = fixture();
  assert.equal(f.fit(650), 682);
  assert.deepEqual(f.bounds(), { x: 619, y: 900, width: 682, height: 88 });
  assert.deepEqual(f.controller.preparationSize, { width: 682, height: 88 });
  f.fit(650);
  assert.equal(f.calls.length, 2);
});
test('grows for translated labels and keeps the bar inside the active display', () => {
  const f = fixture({ x: 400, y: 0, width: 800, height: 1080 });
  assert.equal(f.fit(900), 800);
  assert.equal(f.bounds().x, 400);
  const right = fixture({ x: -1920, y: 0, width: 1920, height: 1080 });
  right.fit(1000);
  assert.equal(right.bounds().x, -1032);
  assert.equal(right.bounds().width, 1032);
});
test('bounds very small and large measurements without changing native height', () => {
  const f = fixture();
  assert.equal(f.fit(1), 352);
  assert.equal(f.fit(2000), 1200);
  assert.equal(f.bounds().height, 88);
  const small = fixture({ x: 0, y: 0, width: 300, height: 400 });
  assert.equal(small.fit(600), 300);
  assert.equal(small.bounds().x, 0);
});
for (const width of [0, -1, NaN, Infinity, null, '650', 2001])
  test(`rejects invalid width ${width}`, () => {
    const f = fixture();
    assert.throws(() => f.fit(width), /Invalid/);
    assert.equal(f.calls.length, 0);
  });
test('announces the exact fitted bounds before native resize so open menus can retain ownership', () => {
  const f = fixture();
  let expected;
  fitPreparationBar(
    f.controller,
    { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    650,
    (next) => {
      assert.equal(f.calls.length, 0);
      expected = next;
    },
  );
  assert.deepEqual(expected, f.bounds());
});
