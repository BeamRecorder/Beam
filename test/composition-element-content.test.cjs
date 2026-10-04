const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeElementContent } = require('../apps/desktop/electron/projects/composition-element-content.cjs');
const { normalizeShapeLayerStyle } = require('../apps/desktop/electron/projects/composition-shape-layer.cjs');

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
  shape: {
    preset: 'rounded',
    radius: 20,
    color: '#000000',
    opacity: 0,
    blur: 0,
    padding: 0,
  },
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
  const normalized = normalizeShapeLayerStyle({
    family: 'shape',
    preset: 'rounded-rectangle',
  });

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
    () =>
      normalizeElementContent({
        family: 'shape',
        text: elementText({ content: 'x'.repeat(10_001) }),
      }),
    /Invalid element text/,
  );
  assert.throws(
    () =>
      normalizeElementContent({
        family: 'shape',
        text: elementText({ padding: 41 }),
      }),
    /Invalid element text/,
  );
});

test('bounds freehand point count and coordinates at the Electron boundary', () => {
  const bounded = normalizeElementContent({
    family: 'drawing',
    drawing: drawing(
      Array.from({ length: 8_192 }, (_, index) => ({
        x: index / 8_191,
        y: 0.5,
      })),
    ),
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
    () =>
      normalizeElementContent({
        family: 'drawing',
        drawing: drawing([{ x: -0.01, y: 0.5 }]),
      }),
    /Invalid freehand drawing/,
  );
});

test('preserves supported text decorations and resets unsupported values', () => {
  const valid = normalizeElementContent({
    family: 'text',
    text: elementText({
      style: captionStyle({ textDecoration: 'underline line-through' }),
    }),
  });
  const invalid = normalizeElementContent({
    family: 'text',
    text: elementText({ style: captionStyle({ textDecoration: 'blink' }) }),
  });

  assert.equal(valid.text.style.textDecoration, 'underline line-through');
  assert.equal(invalid.text.style.textDecoration, 'none');
});

const vector = () => ({
  version: 1,
  contours: [
    {
      closed: false,
      nodes: [
        { id: 'a', x: 0, y: 0, mode: 'smooth', out: { x: 0.3, y: 0.2 } },
        { id: 'b', x: 1, y: 1, mode: 'corner', in: { x: 0.7, y: 0.8 } },
      ],
    },
  ],
  fillRule: 'nonzero',
  strokeWidth: 8,
  startMarker: 'none',
  endMarker: 'triangle',
  markerSize: 18,
});
test('round-trips editable vector arrows through desktop project persistence', () => {
  const source = { family: 'arrow', preset: 'arrow', vector: vector() };
  const normalized = normalizeShapeLayerStyle(source);
  const reopened = normalizeShapeLayerStyle(JSON.parse(JSON.stringify(normalized)));
  assert.deepEqual(reopened.vector, source.vector);
  assert.notEqual(reopened.vector, source.vector);
  normalized.vector.contours[0].nodes[0].out.x = 0.4;
  assert.equal(source.vector.contours[0].nodes[0].out.x, 0.3);
});
test('rejects malformed vector documents at the project storage boundary', () => {
  for (const patch of [
    { version: 2 },
    { strokeWidth: 0 },
    { endMarker: 'bad' },
    { contours: [] },
    { markerSize: Infinity },
  ]) {
    assert.throws(() => normalizeElementContent({ vector: { ...vector(), ...patch } }), /Invalid vector shape/);
  }
});
test('keeps absent and explicitly reset vector paths out of normalized legacy styles', () => {
  assert.equal(Object.hasOwn(normalizeElementContent({}), 'vector'), false);
  assert.equal(Object.hasOwn(normalizeElementContent({ vector: null }), 'vector'), false);
});
