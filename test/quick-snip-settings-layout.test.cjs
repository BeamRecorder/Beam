const assert = require('node:assert/strict');
const test = require('node:test');
const { settingsLayout, validateSettingsAnchor } = require('../electron/quick-snip/quick-snip-settings-layout.cjs');
const area = { x: -1920, y: -100, width: 1920, height: 1080 };
const anchor = { x: 500, y: 26, width: 32, height: 32 };
for (const bar of [
  { x: -1500, y: 850, width: 632, height: 84 },
  { x: -1900, y: -90, width: 632, height: 84 },
  { x: -632, y: 400, width: 632, height: 84 },
])
  test(`settings stay anchored and inside the work area at ${bar.x},${bar.y}`, () => {
    const original = { ...bar };
    const { bounds, anchorX } = settingsLayout(bar, area, 302, anchor);
    assert.ok(bounds.x >= area.x && bounds.y >= area.y);
    assert.ok(bounds.x + bounds.width <= area.x + area.width && bounds.y + bounds.height <= area.y + area.height);
    assert.equal(bounds.x + anchorX, bar.x + anchor.x + anchor.width / 2);
    assert.deepEqual(bar, original);
  });
for (const side of ['above', 'below'])
  test(`chooses ${side} with room for shadows and its pointer`, () => {
    const bar = { x: -1500, y: side === 'above' ? 850 : -90, width: 632, height: 84 };
    assert.equal(settingsLayout(bar, area, 302, anchor).side, side);
  });
test('clamps the pointer and panel on a smaller display', () => {
  const layout = settingsLayout(
    { x: 0, y: 0, width: 632, height: 84 },
    { x: 0, y: 0, width: 200, height: 200 },
    420,
    anchor,
  );
  assert.deepEqual(layout.bounds, { x: 0, y: 0, width: 200, height: 200 });
  assert.equal(layout.anchorX, 174);
});
for (const value of [
  null,
  {},
  { ...anchor, y: -1 },
  { ...anchor, width: 0 },
  { ...anchor, height: '32' },
  { ...anchor, x: NaN },
  { ...anchor, x: 620 },
  { ...anchor, y: 83 },
])
  test(`rejects invalid trigger geometry ${JSON.stringify(value)}`, () =>
    assert.throws(() => validateSettingsAnchor(value, { width: 632, height: 84 }), /Invalid/));
test('accepts zero coordinates and strips unrelated trigger fields', () => {
  assert.deepEqual(
    validateSettingsAnchor({ x: 0, y: 0, width: 32, height: 32, window: 'foreign' }, { width: 632, height: 84 }),
    { x: 0, y: 0, width: 32, height: 32 },
  );
});
