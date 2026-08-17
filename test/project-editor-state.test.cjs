const assert = require('node:assert/strict');
const test = require('node:test');
const { migratePresentation, presentationState } = require('../electron/projects/project-editor-state.cjs');

const cursor = () => ({
  selection: { packId: 'builtin:macos', mode: 'automatic', cursorId: null },
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

test('migrates the legacy automatic cursor selection to the builtin macOS pack', () => {
  const state = presentationState({
    canvas: canvas(undefined),
    selectedBackgroundId: null,
    background: null,
    blurPercent: 0,
    importedBackgrounds: [],
    cursor: { ...cursor(), selectedCursor: 'automatic' },
  });

  assert.deepEqual(state.cursor.selection, {
    packId: 'builtin:macos',
    mode: 'automatic',
    cursorId: null,
  });
});

test('migrates a legacy fixed macOS cursor without discarding presentation settings', () => {
  const legacyCursor = { ...cursor(), selectedCursor: 'handpointing' };
  delete legacyCursor.selection;
  const state = presentationState({
    canvas: canvas(undefined),
    selectedBackgroundId: null,
    background: null,
    blurPercent: 0,
    importedBackgrounds: [],
    cursor: { ...legacyCursor, size: 92 },
  });

  assert.deepEqual(state.cursor.selection, {
    packId: 'builtin:macos',
    mode: 'fixed',
    cursorId: 'handpointing',
  });
  assert.equal(state.cursor.size, 92);
});

test('preserves an unavailable imported pack selection for later reimport', () => {
  const selection = { packId: 'a'.repeat(64), mode: 'fixed', cursorId: 'left_ptr' };
  const state = presentationState({
    canvas: canvas(undefined),
    selectedBackgroundId: null,
    background: null,
    blurPercent: 0,
    importedBackgrounds: [],
    cursor: { ...cursor(), selection },
  });

  assert.deepEqual(state.cursor.selection, selection);
});

test('rejects an automatic selection that carries a fixed cursor id', () => {
  assert.throws(
    () =>
      presentationState({
        canvas: canvas(undefined),
        selectedBackgroundId: null,
        background: null,
        blurPercent: 0,
        importedBackgrounds: [],
        cursor: { ...cursor(), selection: { packId: 'builtin:macos', mode: 'automatic', cursorId: 'ignored' } },
      }),
    /curseur|présentation/i,
  );
});

test('rejects a fixed cursor selection without a cursor id', () => {
  assert.throws(
    () =>
      presentationState({
        canvas: canvas(undefined),
        selectedBackgroundId: null,
        background: null,
        blurPercent: 0,
        importedBackgrounds: [],
        cursor: { ...cursor(), selection: { packId: 'builtin:macos', mode: 'fixed', cursorId: null } },
      }),
    /curseur|présentation/i,
  );
});
