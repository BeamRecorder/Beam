const assert = require('node:assert/strict');
const test = require('node:test');
const {
  historicalAppearance,
  normalizeAppearance,
} = require('../apps/desktop/electron/projects/composition-appearance.cjs');
const { ANIMATED_FRAME_PRESETS } = require('../packages/engine/src/shared/animated-frame-schema.js');

for (const kind of ['screen', 'webcam', 'video', 'image'])
  for (const preset of ANIMATED_FRAME_PRESETS)
    test(`round-trips the ${preset} animated frame for ${kind}`, () => {
      const settings = { preset, width: 4, speed: 1.5 };
      const appearance = normalizeAppearance({
        ...historicalAppearance(kind, true),
        frame: 'animated',
        animatedFrame: settings,
      });
      assert.equal(appearance.frame, 'animated');
      assert.deepEqual(appearance.animatedFrame, settings);
      assert.notEqual(appearance.animatedFrame, settings);
      assert.deepEqual(normalizeAppearance(JSON.parse(JSON.stringify(appearance))), appearance);
    });

test('retains old projects and the default animated effect without inventing saved settings', () => {
  for (const frame of ['none', 'safari', 'windows-95', 'iphone-16-max', 'pixel-9-pro', 'animated']) {
    const appearance = normalizeAppearance({ ...historicalAppearance('image', true), frame });
    assert.equal(Object.hasOwn(appearance, 'animatedFrame'), false);
  }
});

for (const invalid of [
  null,
  [],
  {},
  { preset: 'unknown', width: 3, speed: 1 },
  ...[0, 17, NaN, Infinity, '3'].map((width) => ({ preset: 'purple-haze', width, speed: 1 })),
  ...[-1, 4, NaN, Infinity, '1'].map((speed) => ({ preset: 'purple-haze', width: 3, speed })),
  { preset: 'aurora', width: 3, speed: 1, code: 'shader' },
])
  test(`rejects malformed animated settings ${JSON.stringify(invalid)}`, () => {
    assert.throws(
      () => normalizeAppearance({ ...historicalAppearance('image', true), animatedFrame: invalid }),
      /animated frame/,
    );
  });

test('persists frozen effects and minimum/maximum border thickness', () => {
  for (const width of [1, 16])
    for (const speed of [0, 3]) {
      const settings = { preset: 'electric', width, speed };
      assert.deepEqual(
        normalizeAppearance({ ...historicalAppearance('webcam', true), animatedFrame: settings }).animatedFrame,
        settings,
      );
    }
});
