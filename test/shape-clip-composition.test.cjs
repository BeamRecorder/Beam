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

  assert.equal(normalized.schemaVersion, 14);
  assert.equal(normalized.assets.length, 0);
  assert.deepEqual(normalized.clips[0], { ...shapeClip(), fillEnabled: true });
});

test('preserves normalized gradient fills on shape and drawing clips', () => {
  const fill = {
    kind: 'gradient',
    gradient: {
      type: 'linear',
      angle: 135,
      stops: [
        { id: 'start', position: 0, color: '#112233', alpha: 1 },
        { id: 'end', position: 1, color: '#aabbcc', alpha: 0.5 },
      ],
    },
  };
  const normalized = normalizeComposition({
    ...emptyComposition(),
    clips: [
      shapeClip({ family: 'shape', preset: 'ellipse', fill, fillColor: '#123456' }),
      shapeClip({
        id: 'drawing-1',
        trackId: 'drawing-track',
        family: 'drawing',
        preset: 'freehand',
        drawing: {
          points: [
            { x: 0.1, y: 0.2 },
            { x: 0.8, y: 0.9 },
          ],
          smoothing: 25,
          strokeWidth: 12,
        },
        fill,
        fillColor: '#654321',
      }),
    ],
  });

  const normalizedShape = normalized.clips.find((clip) => clip.id === 'shape-1');
  const normalizedDrawing = normalized.clips.find((clip) => clip.id === 'drawing-1');
  assert.ok(normalizedShape);
  assert.ok(normalizedDrawing);
  assert.deepEqual(normalizedShape.fill, fill);
  assert.equal(normalizedShape.fillColor, '#123456');
  assert.deepEqual(normalizedDrawing.fill, fill);
  assert.equal(normalizedDrawing.fillColor, '#654321');
});

test('preserves shapes selected from the shared vector catalog', () => {
  const normalized = normalizeComposition({
    ...emptyComposition(),
    clips: [shapeClip({ family: 'shape', preset: 'sparkle-quad' })],
  });

  assert.equal(normalized.clips[0].preset, 'sparkle-quad');
});

test('drops an invalid optional gradient fill while preserving the solid legacy fill', () => {
  const normalized = normalizeComposition({
    ...emptyComposition(),
    clips: [
      shapeClip({
        family: 'shape',
        preset: 'rectangle',
        fill: {
          kind: 'gradient',
          gradient: {
            type: 'linear',
            angle: 360,
            stops: [
              { id: 'start', position: 0, color: '#112233', alpha: 1 },
              { id: 'end', position: 1, color: '#aabbcc', alpha: 1 },
            ],
          },
        },
        fillColor: '#123456',
      }),
      shapeClip({ id: 'legacy-shape', trackId: 'legacy-track', family: 'shape', preset: 'rectangle' }),
    ],
  });
  const invalidGradient = normalized.clips.find((clip) => clip.id === 'shape-1');
  const legacyShape = normalized.clips.find((clip) => clip.id === 'legacy-shape');
  assert.ok(invalidGradient);
  assert.ok(legacyShape);

  assert.equal(Object.hasOwn(invalidGradient, 'fill'), false);
  assert.equal(invalidGradient.fillColor, '#123456');
  assert.equal(Object.hasOwn(legacyShape, 'fill'), false);
  assert.equal(legacyShape.fillColor, '#ff5a1f');
});

test('migrates a v12 composition to v14 without changing existing clips', () => {
  const migrated = migrateComposition({
    schemaVersion: 12,
    assets: [],
    clips: [],
    keyboardCaptionSessions: [],
  });

  assert.equal(migrated.schemaVersion, 14);
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
