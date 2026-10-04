const assert = require('node:assert/strict');
const test = require('node:test');
const {
  historicalAppearance,
  normalizeAppearance,
} = require('../apps/desktop/electron/projects/composition-appearance.cjs');

for (const theme of ['auto', 'light', 'dark'])
  test(`persists the ${theme} browser appearance separately from its frame color`, () => {
    const input = { ...historicalAppearance('image', true), frame: 'safari', frameColor: '#123456', frameTheme: theme };
    const normalized = normalizeAppearance(input);
    assert.equal(normalized.frameTheme, theme);
    assert.equal(normalized.frameColor, '#123456');
    assert.equal(normalizeAppearance(JSON.parse(JSON.stringify(normalized))).frameTheme, theme);
  });
test('preserves older appearances without inventing a stored browser theme', () => {
  assert.equal(Object.hasOwn(normalizeAppearance(historicalAppearance('image', true)), 'frameTheme'), false);
});
for (const invalid of ['system', null, 1, {}, ['dark']])
  test(`rejects invalid browser appearance ${JSON.stringify(invalid)}`, () => {
    assert.throws(
      () => normalizeAppearance({ ...historicalAppearance('image', true), frameTheme: invalid }),
      /Apparence/,
    );
  });
