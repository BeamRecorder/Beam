const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeElementContent } = require('../electron/projects/composition-element-content.cjs');
const { normalizeShapeLayerStyle } = require('../electron/projects/composition-shape-layer.cjs');

const captionStyle = (overrides = {}) => ({
  fontFamily: 'Inter',
  fontAssetId: 'a'.repeat(64),
  fontWeight: 400,
  fontStyle: 'italic',
  textDecoration: 'underline line-through',
  textAlign: 'left',
  lineHeight: 1.25,
  letterSpacing: 1.5,
  color: '#ffffff',
  fontSize: 48,
  wrap: true,
  shadowColor: '#000000',
  shadowBlur: 4,
  shape: { preset: 'rounded', radius: 20, color: '#000000', opacity: 0, blur: 0, padding: 0 },
  outlineColor: '#000000',
  outlineWidth: 0,
  extrusionDepth: 0,
  placement: 'center',
  ...overrides,
});

const elementText = (overrides = {}) => ({
  content: 'Label inside the shape',
  padding: 8,
  verticalAlign: 'center',
  style: captionStyle(),
  ...overrides,
});

const drawing = (
  points = [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.25 },
    { x: 1, y: 1 },
  ],
) => ({
  points,
  smoothing: 65,
  strokeWidth: 8,
});

test('preserves an older shape without adding element payloads', () => {
  const normalized = normalizeShapeLayerStyle({ family: 'shape', preset: 'rounded-rectangle' });

  assert.equal(normalized.family, 'shape');
  assert.equal(normalized.preset, 'rounded-rectangle');
  assert.equal(Object.hasOwn(normalized, 'text'), false);
  assert.equal(Object.hasOwn(normalized, 'drawing'), false);
});

test('round-trips an integrated text shape through the Electron style normalizer', () => {
  const source = {
    family: 'text',
    preset: 'text',
    text: elementText(),
  };

  const normalized = normalizeShapeLayerStyle(source);
  const reopened = normalizeShapeLayerStyle(JSON.parse(JSON.stringify(normalized)));

  assert.deepEqual(reopened, normalized);
  assert.equal(reopened.text.content, source.text.content);
  assert.equal(reopened.text.padding, 8);
  assert.equal(reopened.text.verticalAlign, 'center');
  assert.equal(reopened.text.style.fontAssetId, 'a'.repeat(64));
});

test('round-trips normalized freehand drawing points and settings', () => {
  const source = {
    family: 'drawing',
    preset: 'freehand',
    drawing: drawing(),
  };

  const normalized = normalizeShapeLayerStyle(source);
  const reopened = normalizeShapeLayerStyle(JSON.parse(JSON.stringify(normalized)));

  assert.deepEqual(reopened, normalized);
  assert.deepEqual(reopened.drawing, source.drawing);
});

test('rejects missing or oversized text payloads', () => {
  assert.throws(() => normalizeElementContent({ family: 'text' }), /Missing element content/);
  assert.throws(
    () => normalizeElementContent({ family: 'shape', text: elementText({ content: 'x'.repeat(10_001) }) }),
    /Invalid element text/,
  );
  assert.throws(
    () => normalizeElementContent({ family: 'shape', text: elementText({ padding: 41 }) }),
    /Invalid element text/,
  );
});

test('bounds freehand point count and coordinates at the Electron boundary', () => {
  const bounded = normalizeElementContent({
    family: 'drawing',
    drawing: drawing(Array.from({ length: 8_192 }, (_, index) => ({ x: index / 8_191, y: 0.5 }))),
  });
  assert.equal(bounded.drawing.points.length, 8_192);

  assert.throws(
    () =>
      normalizeElementContent({
        family: 'drawing',
        drawing: drawing(Array.from({ length: 8_193 }, () => ({ x: 0.5, y: 0.5 }))),
      }),
    /Invalid freehand drawing/,
  );
  assert.throws(
    () => normalizeElementContent({ family: 'drawing', drawing: drawing([{ x: -0.01, y: 0.5 }]) }),
    /Invalid freehand drawing/,
  );
});

test('preserves supported text decorations and resets unsupported values', () => {
  const valid = normalizeElementContent({
    family: 'text',
    text: elementText({ style: captionStyle({ textDecoration: 'underline line-through' }) }),
  });
  const invalid = normalizeElementContent({
    family: 'text',
    text: elementText({ style: captionStyle({ textDecoration: 'blink' }) }),
  });

  assert.equal(valid.text.style.textDecoration, 'underline line-through');
  assert.equal(invalid.text.style.textDecoration, 'none');
});
