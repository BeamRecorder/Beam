const assert = require('node:assert/strict');
const test = require('node:test');
const { historicalAppearance } = require('../electron/projects/composition-appearance.cjs');
const { validateScreenshotState } = require('../electron/screenshot/screenshot-validation.cjs');

const blendModes = [
  'source-over',
  'darken',
  'multiply',
  'color-burn',
  'lighten',
  'screen',
  'color-dodge',
  'lighter',
  'overlay',
  'soft-light',
  'hard-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
];

const shape = (id = 'shape-1') => ({
  kind: 'shape',
  family: 'shape',
  id,
  transform: { x: 0.3, y: 0.3, width: 0.4, height: 0.3 },
  enabled: true,
  rotation: 0,
  borderWidth: 0,
  shadowBlur: 0,
});

const cursor = (patch = {}) => ({
  id: 'cursor-1',
  name: 'Static cursor',
  enabled: true,
  position: { x: 0.45, y: 0.45 },
  size: 45,
  rotation: 0,
  selection: { packId: 'builtin:macos', mode: 'fixed', cursorId: 'default' },
  color: '#000000',
  shadowEnabled: true,
  shadowBlur: 6,
  shadowColor: '#000000',
  shadowDirection: 'bottom',
  ...patch,
});

const screenshotState = (patch = {}) => {
  const base = {
    format: 'png',
    quality: 0.95,
    blurPercent: 30,
    background: null,
    shapes: [],
    image: {
      id: 'screenshot',
      kind: 'image',
      transform: { x: 0.06, y: 0.06, width: 0.88, height: 0.88 },
      appearance: historicalAppearance('screen', true),
    },
    canvas: { width: 1280, height: 720, showBackground: true },
  };
  return {
    ...base,
    ...patch,
    image: { ...base.image, ...patch.image },
    canvas: { ...base.canvas, ...patch.canvas },
  };
};

const layerSettings = (id, patch = {}) => ({
  id,
  opacity: 100,
  blendMode: 'source-over',
  locked: false,
  ...patch,
});

const layerIds = (state) => [
  '__background__',
  state.image.id,
  ...state.shapes.map(({ id }) => id),
  ...(state.cursors ?? []).map(({ id }) => id),
  '__watermark__',
];

const withComposition = (state, ids = layerIds(state)) => {
  state.composition = ids.map((id) => layerSettings(id));
  return state;
};

test('accepts boundary cursor payloads, normalized hex colours, and boundary layer opacities', () => {
  for (const boundary of [
    { position: { x: -10, y: 10 }, size: 16, rotation: 0, shadowBlur: 0, color: '#AABBCCDD' },
    { position: { x: 10, y: -10 }, size: 384, rotation: 360, shadowBlur: 24, color: '#aabbcc' },
  ]) {
    const state = withComposition(screenshotState({ cursors: [cursor(boundary)] }));
    state.composition[0].opacity = 0;
    state.composition.at(-1).opacity = 100;
    assert.doesNotThrow(() => validateScreenshotState(state));
  }

  const longId = 'c'.repeat(200);
  const longSettings = withComposition(
    screenshotState({
      cursors: [
        cursor({
          id: longId,
          name: 'n'.repeat(200),
          selection: { packId: 'p'.repeat(200), mode: 'fixed', cursorId: 'a'.repeat(200) },
        }),
      ],
    }),
  );
  assert.doesNotThrow(() => validateScreenshotState(longSettings));
});

test('accepts all supported Canvas blend modes', () => {
  assert.equal(blendModes.length, 17);
  for (const blendMode of blendModes) {
    const state = withComposition(screenshotState());
    state.composition[0].blendMode = blendMode;
    assert.doesNotThrow(() => validateScreenshotState(state), blendMode);
  }
});

test('rejects cursor IDs, selection modes, and values outside their bounds', () => {
  const invalidCursors = [
    ['empty id', { id: '' }],
    ['long id', { id: 'c'.repeat(201) }],
    ['empty name', { name: '' }],
    ['long name', { name: 'n'.repeat(201) }],
    ['non-boolean visibility', { enabled: 1 }],
    ['missing position', { position: null }],
    ['out-of-range x', { position: { x: -10.01, y: 0 } }],
    ['out-of-range y', { position: { x: 0, y: 10.01 } }],
    ['string coordinate', { position: { x: '0.5', y: 0 } }],
    ['undersized cursor', { size: 15.99 }],
    ['oversized cursor', { size: 385 }],
    ['negative rotation', { rotation: -0.01 }],
    ['excessive rotation', { rotation: 360.01 }],
    ['automatic selection', { selection: { packId: 'pack', mode: 'automatic', cursorId: null } }],
    ['empty pack id', { selection: { packId: '', mode: 'fixed', cursorId: 'default' } }],
    ['empty cursor id in selection', { selection: { packId: 'pack', mode: 'fixed', cursorId: '' } }],
    ['oversized pack id', { selection: { packId: 'p'.repeat(201), mode: 'fixed', cursorId: 'default' } }],
    ['invalid colour', { color: 'rgb(0, 0, 0)' }],
    ['invalid shadow colour', { shadowColor: '#12345' }],
    ['non-boolean shadow toggle', { shadowEnabled: 'true' }],
    ['negative shadow blur', { shadowBlur: -0.01 }],
    ['excessive shadow blur', { shadowBlur: 24.01 }],
    ['unknown shadow direction', { shadowDirection: 'left' }],
  ];

  for (const [label, patch] of invalidCursors) {
    const state = withComposition(screenshotState({ cursors: [cursor(patch)] }));
    assert.throws(() => validateScreenshotState(state), /invalid screenshot cursor/i, label);
  }
});

test('requires every compositing entry to be unique and reference an existing screenshot layer', () => {
  const valid = withComposition(screenshotState({ shapes: [shape()], cursors: [cursor()] }));
  assert.doesNotThrow(() => validateScreenshotState(structuredClone(valid)));

  const missing = structuredClone(valid);
  missing.composition = missing.composition.filter(({ id }) => id !== 'cursor-1');
  assert.throws(() => validateScreenshotState(missing), /invalid screenshot composition/i);

  const staleReference = structuredClone(valid);
  staleReference.composition[0].id = 'removed-layer';
  assert.throws(() => validateScreenshotState(staleReference), /invalid screenshot compositing settings/i);

  const duplicateEntry = structuredClone(valid);
  duplicateEntry.composition[0].id = duplicateEntry.composition[1].id;
  assert.throws(() => validateScreenshotState(duplicateEntry), /invalid screenshot compositing settings/i);
});

test('rejects duplicate IDs across content and reserved screenshot layers', () => {
  for (const cursors of [
    [cursor(), cursor({ id: 'cursor-1', name: 'Second cursor' })],
    [cursor({ id: 'screenshot' })],
    [cursor({ id: 'shape-1' })],
    [cursor({ id: '__background__' })],
    [cursor({ id: '__watermark__' })],
  ]) {
    const state = withComposition(
      screenshotState({ shapes: cursors.some(({ id }) => id === 'shape-1') ? [shape()] : [], cursors }),
    );
    assert.throws(() => validateScreenshotState(state), /invalid screenshot cursor/i);
  }

  const reservedImage = screenshotState({ image: { id: '__background__' } });
  assert.throws(() => validateScreenshotState(reservedImage), /duplicate screenshot layer identifier/i);
  const reservedShape = screenshotState({ shapes: [shape('__watermark__')] });
  assert.throws(() => validateScreenshotState(reservedShape), /duplicate screenshot layer identifier/i);
});

test('rejects invalid opacity, blend mode, and lock settings', () => {
  const invalidSettings = [
    ['negative opacity', { opacity: -0.01 }],
    ['opacity above 100', { opacity: 100.01 }],
    ['non-finite opacity', { opacity: Number.NaN }],
    ['unknown blend mode', { blendMode: 'normal' }],
    ['non-boolean lock', { locked: 0 }],
  ];

  for (const [label, settings] of invalidSettings) {
    const state = withComposition(screenshotState());
    Object.assign(state.composition[0], settings);
    assert.throws(() => validateScreenshotState(state), /invalid screenshot compositing settings/i, label);
  }
});

test('accepts legacy screenshot states without composition metadata without synthesizing a new order', () => {
  const state = screenshotState({ shapes: [shape()] });

  assert.equal('composition' in state, false);
  assert.doesNotThrow(() => validateScreenshotState(state));
  assert.equal('composition' in state, false);
});
