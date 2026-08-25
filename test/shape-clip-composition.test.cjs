const assert = require('node:assert/strict');
const test = require('node:test');
const {
  emptyComposition,
  migrateComposition,
  normalizeComposition,
} = require('../electron/projects/clip-composition.cjs');

const shapeClip = (overrides = {}) => ({
  id: 'shape-1',
  trackId: 'shape-track',
  kind: 'shape',
  name: 'Shape',
  assetId: '',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  transform: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 },
  family: 'arrow',
  preset: 'arrow',
  fillColor: '#ff5a1f',
  borderColor: '#ffffff',
  borderWidth: 4,
  cornerRadius: 16,
  arrowThickness: 36,
  arrowHeadSize: 38,
  rotation: 0,
  opacityEnabled: true,
  opacity: 80,
  backdropBlur: 30,
  shadowEnabled: true,
  shadowColor: '#000000',
  shadowBlur: 20,
  shadowDirection: 'bottom-right',
  ...overrides,
});

test('normalizes an assetless shape clip for persistence', () => {
  const normalized = normalizeComposition({
    ...emptyComposition(),
    clips: [shapeClip()],
  });

  assert.equal(normalized.schemaVersion, 13);
  assert.equal(normalized.assets.length, 0);
  assert.deepEqual(normalized.clips[0], shapeClip());
});

test('migrates a v12 composition to v13 without changing existing clips', () => {
  const migrated = migrateComposition({
    schemaVersion: 12,
    assets: [],
    clips: [],
    keyboardCaptionSessions: [],
  });

  assert.equal(migrated.schemaVersion, 13);
  assert.deepEqual(migrated.clips, []);
});

test('repairs invalid shape style values with safe defaults', () => {
  const normalized = normalizeComposition({
    ...emptyComposition(),
    clips: [
      shapeClip({
        family: 'shape',
        preset: 'arrow',
        opacity: Number.NaN,
        shadowBlur: Number.POSITIVE_INFINITY,
      }),
    ],
  });

  assert.equal(normalized.clips[0].preset, 'rounded-rectangle');
  assert.equal(normalized.clips[0].opacity, 70);
  assert.equal(normalized.clips[0].shadowBlur, 32);
});
