const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeCaption } = require('./composition-captions.cjs');

const baseStyle = () => ({
  color: '#ffffff',
  fontSize: 36,
  wrap: true,
  shadowColor: '#000000',
  shadowBlur: 8,
  shape: {
    preset: 'rounded',
    radius: 35,
    color: '#000000',
    opacity: 0,
    blur: 0,
    padding: 30,
  },
  outlineColor: '#000000',
  outlineWidth: 0,
  extrusionDepth: 0,
  placement: 'bottom',
});

const textCaption = (style = baseStyle()) => ({
  type: 'text',
  sentences: [],
  style,
});

test('adds default wordHighlight values to legacy caption styles', () => {
  const normalized = normalizeCaption(textCaption());

  assert.deepEqual(normalized.style.wordHighlight, {
    enabled: false,
    displayMode: 'sentence',
    fill: 'solid',
    color: '#facc15',
    gradient: {
      type: 'linear',
      angle: 90,
      stops: [
        { id: 'highlight-start', position: 0, color: '#facc15', alpha: 1 },
        { id: 'highlight-end', position: 1, color: '#fb7185', alpha: 1 },
      ],
    },
    effect: 'pop',
    intensity: 55,
    inactiveOpacity: 72,
  });
});

test('preserves a valid radial gradient and its stops and alpha values', () => {
  const wordHighlight = {
    enabled: true,
    displayMode: 'word',
    fill: 'gradient',
    color: '#22c55e',
    gradient: {
      type: 'radial',
      angle: 135,
      stops: [
        { id: 'custom-start', position: 0.15, color: '#22c55e', alpha: 0.25 },
        { id: 'custom-end', position: 0.85, color: '#0ea5e9', alpha: 0.75 },
      ],
    },
    effect: 'pulse',
    intensity: 80,
    inactiveOpacity: 35,
  };

  const normalized = normalizeCaption(textCaption({ ...baseStyle(), wordHighlight }));

  assert.deepEqual(normalized.style.wordHighlight, wordHighlight);
});

test('normalizes and preserves the grouped caption shape style', () => {
  const shape = {
    preset: 'pill',
    radius: 92,
    color: '#123456',
    opacity: 68,
    blur: 24,
    padding: 64,
  };

  const normalized = normalizeCaption(textCaption({ ...baseStyle(), shape }));

  assert.deepEqual(normalized.style.shape, shape);
  assert.equal(Object.hasOwn(normalized.style, 'backdropBlur'), false);
});

test('clamps invalid caption shape values and falls back to the default shape', () => {
  const normalized = normalizeCaption(
    textCaption({
      ...baseStyle(),
      shape: {
        preset: 'invalid',
        radius: 120,
        color: null,
        opacity: -10,
        blur: 999,
        padding: 140,
      },
    }),
  );

  assert.deepEqual(normalized.style.shape, {
    preset: 'rounded',
    radius: 100,
    color: '#000000',
    opacity: 0,
    blur: 48,
    padding: 100,
  });

  const fallback = normalizeCaption(textCaption({ ...baseStyle(), shape: null }));
  assert.deepEqual(fallback.style.shape, {
    preset: 'rounded',
    radius: 35,
    color: '#000000',
    opacity: 0,
    blur: 0,
    padding: 0,
  });

  const lowerClamped = normalizeCaption(textCaption({ ...baseStyle(), shape: { ...baseStyle().shape, padding: -10 } }));
  assert.equal(lowerClamped.style.shape.padding, 0);
});

test('maps legacy backdropBlur into shape.blur without retaining the legacy field', () => {
  const { shape: _shape, ...legacyStyle } = baseStyle();
  const normalized = normalizeCaption(textCaption({ ...legacyStyle, backdropBlur: 32 }));

  assert.equal(normalized.style.shape.blur, 32);
  assert.equal(normalized.style.shape.padding, 0);
  assert.equal(Object.hasOwn(normalized.style, 'backdropBlur'), false);
});

test('clamps out-of-range numeric values and defaults an invalid gradient', () => {
  const clamped = normalizeCaption(
    textCaption({
      ...baseStyle(),
      wordHighlight: {
        intensity: -20,
        inactiveOpacity: 150,
        gradient: {
          type: 'linear',
          angle: 999,
          stops: [
            { id: 'start', position: 0, color: '#fff', alpha: 0 },
            { id: 'end', position: 1, color: '#000', alpha: 1 },
          ],
        },
      },
    }),
  );

  assert.equal(clamped.style.wordHighlight.intensity, 0);
  assert.equal(clamped.style.wordHighlight.inactiveOpacity, 100);
  assert.equal(clamped.style.wordHighlight.gradient.angle, 360);

  const invalidGradient = normalizeCaption(
    textCaption({
      ...baseStyle(),
      wordHighlight: {
        gradient: {
          type: 'diagonal',
          angle: 45,
          stops: [{ id: 'only-stop', position: 0.5, color: '#fff', alpha: 2 }],
        },
      },
    }),
  );

  assert.deepEqual(invalidGradient.style.wordHighlight.gradient, {
    type: 'linear',
    angle: 90,
    stops: [
      { id: 'highlight-start', position: 0, color: '#facc15', alpha: 1 },
      { id: 'highlight-end', position: 1, color: '#fb7185', alpha: 1 },
    ],
  });
});
