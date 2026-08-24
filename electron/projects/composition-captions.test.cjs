const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeCaption } = require('./composition-captions.cjs');

const baseStyle = () => ({
  color: '#ffffff',
  fontSize: 36,
  wrap: true,
  shadowColor: '#000000',
  shadowBlur: 8,
  backdropBlur: 0,
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
