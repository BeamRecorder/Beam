const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeAppearance,
  historicalAppearance,
} = require('../apps/desktop/electron/projects/composition-appearance.cjs');
const { normalizeShapeLayerStyle } = require('../apps/desktop/electron/projects/composition-shape-layer.cjs');
const { normalizeColorLayerStyle } = require('../apps/desktop/electron/projects/composition-color-layer.cjs');
const {
  createDefaultPresentation,
  presentationState,
} = require('../apps/desktop/electron/projects/project-editor-state.cjs');

for (const shadowDistance of [0, 40, 256]) {
  test(`persists explicit shadow distance ${shadowDistance} for media, shapes and color layers`, () => {
    assert.equal(
      normalizeAppearance({ ...historicalAppearance('screen', true), shadowDistance }).shadowDistance,
      shadowDistance,
    );
    assert.equal(normalizeShapeLayerStyle({ shadowDistance }).shadowDistance, shadowDistance);
    assert.equal(normalizeColorLayerStyle({ shadowDistance }).shadowDistance, shadowDistance);
  });
}
test('old styles retain an omitted distance rather than a fabricated value', () => {
  assert.equal(Object.hasOwn(normalizeAppearance(historicalAppearance('screen', true)), 'shadowDistance'), false);
  assert.equal(Object.hasOwn(normalizeShapeLayerStyle({}), 'shadowDistance'), false);
  assert.equal(Object.hasOwn(normalizeColorLayerStyle({ shadowBlur: 24 }), 'shadowDistance'), false);
});
test('rejects invalid distances at the native storage boundary', () => {
  for (const shadowDistance of [-1, 257, NaN, Infinity, null, '20']) {
    assert.throws(() => normalizeAppearance({ ...historicalAppearance('screen', true), shadowDistance }));
    assert.throws(() => normalizeShapeLayerStyle({ shadowDistance }));
    assert.throws(() => normalizeColorLayerStyle({ shadowDistance }));
  }
});
test('cursor and watermark distances survive presentation save and reload', () => {
  const presentation = createDefaultPresentation();
  presentation.cursor.shadow.distance = 40;
  presentation.canvas.watermark = {
    enabled: true,
    text: 'beam',
    showLogo: true,
    localized: false,
    position: 'bottom-right',
    size: 100,
    shadow: 20,
    shadowDistance: 30,
    shadowDirection: 'bottom-right',
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    backgroundRadius: 100,
    backgroundPadding: 100,
  };
  const restored = presentationState(JSON.parse(JSON.stringify(presentation)));
  assert.equal(restored.cursor.shadow.distance, 40);
  assert.equal(restored.canvas.watermark.shadowDistance, 30);
  assert.equal(restored.canvas.watermark.shadowDirection, 'bottom-right');
});
