const assert = require('node:assert/strict');
const test = require('node:test');
const {
  emptyComposition,
  normalizeComposition,
  migrateComposition,
} = require('../apps/desktop/electron/projects/clip-composition.cjs');

test('preserves optional timeline duration through project normalization and reopening', () => {
  const legacy = normalizeComposition(emptyComposition());
  assert.equal(Object.hasOwn(legacy, 'durationMs'), false);
  for (const durationMs of [0, 1500, 1500.5]) {
    const saved = normalizeComposition({ ...emptyComposition(), durationMs });
    const reopened = migrateComposition(JSON.parse(JSON.stringify(saved)), false);
    assert.equal(reopened.durationMs, durationMs);
  }
});
test('rejects invalid explicit timeline durations at the project boundary', () => {
  for (const durationMs of [-1, NaN, Infinity, null, '1500', true])
    assert.throws(() => normalizeComposition({ ...emptyComposition(), durationMs }), /Invalid composition duration/);
});
