const assert = require('node:assert/strict');
const test = require('node:test');
const {
  defaultZoomMotionBlur,
  migratePresentation,
  presentationState,
  zoomState,
} = require('../electron/projects/project-editor-state.cjs');

const cursor = () => ({
  selectedCursor: 'automatic',
  size: 45,
  color: '#000000',
  shadow: { enabled: true, blur: 6, color: '#000000', direction: 'bottom' },
  clickEffects: {
    left: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#ff5a1f' },
    right: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#6366f1' },
  },
  motion: { preset: 'smooth', smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
});

const watermark = () => ({
  enabled: true,
  text: 'beam',
  showLogo: false,
  localized: true,
  renderedText: 'Beam',
  position: 'top-left',
  size: 140,
  shadow: 70,
  backgroundColor: '#abcdef',
  backgroundOpacity: 42,
  backgroundRadius: 33,
  backgroundPadding: 120,
});

const canvas = (value) => ({
  preset: '16:9',
  width: 1920,
  height: 1080,
  showBackground: true,
  watermark: value,
});

test('preserves every watermark presentation field', () => {
  const expected = watermark();
  const state = presentationState({
    canvas: canvas(expected),
    selectedBackgroundId: null,
    background: null,
    blurPercent: 0,
    importedBackgrounds: [],
    cursor: cursor(),
  });

  assert.deepEqual(state.canvas.watermark, expected);
});

test('migrates every watermark presentation field from legacy editor state', () => {
  const expected = watermark();
  const state = migratePresentation({
    canvas: canvas(expected),
    selectedBackgroundId: null,
    background: null,
    blurPercent: 0,
    importedBackgrounds: [],
    cursorEffects: cursor().clickEffects,
    cursorMotion: cursor().motion,
  });

  assert.deepEqual(state.canvas.watermark, expected);
});

test('defaults zoom motion blur when loading legacy editor state', () => {
  const state = zoomState({ elements: [], generatedSessions: [] });

  assert.deepEqual(state.motionBlur, defaultZoomMotionBlur());
});

test('normalizes persisted zoom motion blur enabled state and intensity', () => {
  const state = zoomState({
    elements: [],
    generatedSessions: [],
    motionBlur: { enabled: false, intensity: 4 },
  });

  assert.deepEqual(state.motionBlur, { enabled: false, intensity: 1 });
});

test('rejects malformed persisted zoom motion blur settings', () => {
  assert.throws(
    () => zoomState({ elements: [], generatedSessions: [], motionBlur: { enabled: 'yes', intensity: 0.5 } }),
    /Flou de mouvement du zoom invalide/,
  );
});
