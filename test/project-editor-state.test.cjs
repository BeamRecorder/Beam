const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createDefaultPresentation,
  defaultZoomMotionBlur,
  migratePresentation,
  presentationState,
  zoomState,
} = require('../electron/projects/project-editor-state.cjs');

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
  autoHide: { enabled: true, delaySeconds: 3.5, fadeDurationMs: 640 },
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

test('defaults new cursor presentations to spring-on and ripple-off for both buttons', () => {
  const state = createDefaultPresentation();

  assert.deepEqual(state.cursor.clickEffects, {
    left: {
      springEnabled: true,
      springIntensity: 50,
      rippleEnabled: false,
      rippleStyle: 'single',
      rippleSize: 30,
      rippleColor: '#ff5a1f',
    },
    right: {
      springEnabled: true,
      springIntensity: 50,
      rippleEnabled: false,
      rippleStyle: 'single',
      rippleSize: 30,
      rippleColor: '#6366f1',
    },
  });
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
  const legacyCursor = { ...cursor(), selectedCursor: 'automatic' };
  delete legacyCursor.selection;
  const state = presentationState({
    canvas: canvas(undefined),
    selectedBackgroundId: null,
    background: null,
    blurPercent: 0,
    importedBackgrounds: [],
    cursor: legacyCursor,
  });

  assert.deepEqual(state.cursor.selection, {
    packId: 'builtin:macos',
    mode: 'automatic',
    cursorId: null,
  });
});

test('defaults cursor auto-hide to disabled after migrating a legacy presentation', () => {
  const state = migratePresentation({
    canvas: canvas(undefined),
    selectedBackgroundId: null,
    background: null,
    blurPercent: 0,
    importedBackgrounds: [],
  });

  assert.deepEqual(state.cursor.autoHide, { enabled: false, delaySeconds: 2, fadeDurationMs: 250 });
});

test('clamps cursor auto-hide delay to the supported range during Electron normalization', () => {
  const belowMinimum = presentationState({
    canvas: canvas(undefined),
    selectedBackgroundId: null,
    background: null,
    blurPercent: 0,
    importedBackgrounds: [],
    cursor: { ...cursor(), autoHide: { enabled: true, delaySeconds: 0.1, fadeDurationMs: -1 } },
  });
  const aboveMaximum = presentationState({
    canvas: canvas(undefined),
    selectedBackgroundId: null,
    background: null,
    blurPercent: 0,
    importedBackgrounds: [],
    cursor: { ...cursor(), autoHide: { enabled: true, delaySeconds: 25, fadeDurationMs: 2_000 } },
  });

  assert.deepEqual(belowMinimum.cursor.autoHide, { enabled: true, delaySeconds: 0.5, fadeDurationMs: 0 });
  assert.deepEqual(aboveMaximum.cursor.autoHide, { enabled: true, delaySeconds: 10, fadeDurationMs: 1_000 });
});

test('preserves cursor auto-hide settings in the normalized presentation', () => {
  const state = presentationState({
    canvas: canvas(undefined),
    selectedBackgroundId: null,
    background: null,
    blurPercent: 0,
    importedBackgrounds: [],
    cursor: cursor(),
  });

  assert.deepEqual(state.cursor.autoHide, { enabled: true, delaySeconds: 3.5, fadeDurationMs: 640 });
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

test('migrates legacy zoom elements to the flat 2D projection', () => {
  const state = zoomState({
    elements: [
      {
        id: 'legacy-zoom',
        sessionId: 'session',
        startMs: 101.4,
        endMs: 1_999.6,
        focus: { cx: 0.25, cy: 0.75 },
        depth: 2,
        mode: 'manual',
      },
    ],
    generatedSessions: [],
  });

  assert.deepEqual(state.elements[0], {
    id: 'legacy-zoom',
    sessionId: 'session',
    startMs: 101,
    endMs: 2_000,
    focus: { cx: 0.25, cy: 0.75 },
    depth: 2,
    mode: 'manual',
    projection: '2d',
    tiltIntensity: 0.6,
    tiltHorizontal: 0.65,
    tiltVertical: -0.35,
    tiltPreset: 'medium',
  });
});

test('clamps persisted perspective intensity and rejects invalid projection values', () => {
  const state = zoomState({
    elements: [
      {
        id: 'low-tilt',
        sessionId: 'session',
        startMs: 0,
        endMs: 500,
        focus: { cx: 0.5, cy: 0.5 },
        depth: 1,
        mode: 'auto',
        projection: '3d',
        tiltIntensity: -10,
        tiltHorizontal: -10,
        tiltVertical: 10,
      },
      {
        id: 'high-tilt',
        sessionId: 'session',
        startMs: 500,
        endMs: 1_000,
        focus: { cx: 0.5, cy: 0.5 },
        depth: 1,
        mode: 'auto',
        projection: '3d',
        tiltIntensity: 10,
        tiltHorizontal: 10,
        tiltVertical: -10,
      },
    ],
    generatedSessions: [],
  });

  assert.equal(state.elements[0].tiltIntensity, 0);
  assert.equal(state.elements[1].tiltIntensity, 1);
  assert.equal(state.elements[0].tiltHorizontal, -1);
  assert.equal(state.elements[0].tiltVertical, 1);
  assert.equal(state.elements[1].tiltHorizontal, 1);
  assert.equal(state.elements[1].tiltVertical, -1);
  assert.throws(
    () =>
      zoomState({
        elements: [
          {
            id: 'invalid-projection',
            sessionId: 'session',
            startMs: 0,
            endMs: 500,
            focus: { cx: 0.5, cy: 0.5 },
            depth: 1,
            mode: 'manual',
            projection: 'perspective',
          },
        ],
        generatedSessions: [],
      }),
    /Propriétés de zoom invalides/,
  );
  assert.throws(
    () =>
      zoomState({
        elements: [
          {
            id: 'invalid-axis',
            sessionId: 'session',
            startMs: 0,
            endMs: 500,
            focus: { cx: 0.5, cy: 0.5 },
            depth: 1,
            mode: 'manual',
            tiltHorizontal: Number.NaN,
          },
        ],
        generatedSessions: [],
      }),
    /Propriétés de zoom invalides/,
  );
});

test('persists valid 3D zoom settings without dropping the projection contract', () => {
  const state = zoomState({
    elements: [
      {
        id: 'perspective-zoom',
        sessionId: 'session',
        startMs: 0,
        endMs: 1_000,
        focus: { cx: 0.5, cy: 0.5 },
        depth: 4,
        mode: 'manual',
        projection: '3d',
        tiltIntensity: 0.82,
        tiltHorizontal: 0.42,
        tiltVertical: -0.77,
        tiltPreset: 'large',
      },
    ],
    generatedSessions: [],
  });

  assert.equal(state.elements[0].projection, '3d');
  assert.equal(state.elements[0].tiltIntensity, 0.82);
  assert.equal(state.elements[0].tiltHorizontal, 0.42);
  assert.equal(state.elements[0].tiltVertical, -0.77);
  assert.equal(state.elements[0].tiltPreset, 'large');
});

test('infers legacy tilt presets from intensity and validates explicit presets', () => {
  const state = zoomState({
    elements: [
      {
        id: 'small',
        sessionId: 'session',
        startMs: 0,
        endMs: 100,
        focus: { cx: 0.5, cy: 0.5 },
        depth: 1,
        mode: 'auto',
        tiltIntensity: 0.3,
      },
      {
        id: 'custom',
        sessionId: 'session',
        startMs: 100,
        endMs: 200,
        focus: { cx: 0.5, cy: 0.5 },
        depth: 1,
        mode: 'auto',
        tiltIntensity: 0.42,
      },
      {
        id: 'explicit-custom',
        sessionId: 'session',
        startMs: 200,
        endMs: 300,
        focus: { cx: 0.5, cy: 0.5 },
        depth: 1,
        mode: 'manual',
        tiltIntensity: 0.6,
        tiltPreset: 'custom',
      },
    ],
    generatedSessions: [],
  });

  assert.equal(state.elements[0].tiltPreset, 'small');
  assert.equal(state.elements[1].tiltPreset, 'custom');
  assert.equal(state.elements[2].tiltPreset, 'custom');
  assert.throws(
    () =>
      zoomState({
        elements: [
          {
            id: 'invalid-preset',
            sessionId: 'session',
            startMs: 0,
            endMs: 100,
            focus: { cx: 0.5, cy: 0.5 },
            depth: 1,
            mode: 'manual',
            tiltPreset: 'extreme',
          },
        ],
        generatedSessions: [],
      }),
    /Propriétés de zoom invalides/,
  );
});
