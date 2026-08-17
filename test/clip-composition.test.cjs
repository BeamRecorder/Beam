const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  emptyComposition,
  importMedia,
  materializeComposition,
  migrateComposition,
  normalizeComposition,
  pruneProjectMedia,
} = require('../electron/projects/clip-composition.cjs');
const { createProjectStore } = require('../electron/projects/project-store.cjs');

const setup = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-clips-'));
  return { directory };
};

const visualClip = (assetId, overrides = {}) => ({
  id: 'clip-video',
  kind: 'video',
  name: 'Video',
  assetId,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: {
    cornerRadius: 'sm',
    shadowSize: 'md',
    shadowBlur: 20,
    shadowMode: 'solid',
    shadowColor: '#000000',
    shadowDirection: 'all',
    borderEnabled: false,
    borderColor: '#000000',
    borderWidth: 1,
    frame: 'none',
    frameTitle: '',
    frameColor: '#c0c0c0',
    frameShowMenu: true,
    frameShowScrollbars: true,
    frameChromeScale: 1,
  },
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
  trackId: overrides.trackId ?? overrides.id ?? 'clip-video',
});

const webcamClip = (assetId, overrides = {}) => {
  const clip = visualClip(assetId, {
    id: 'clip-webcam',
    kind: 'webcam',
    trackId: 'camera-track',
    transform: { x: 0.17, y: 0.23, width: 0.31, height: 0.27 },
    crop: { x: 0.11, y: 0.07, width: 0.73, height: 0.81 },
    isMirrored: true,
    isMirroredY: true,
    ...overrides,
  });
  if (!Object.hasOwn(overrides, 'cameraLayoutPreset')) delete clip.cameraLayoutPreset;
  if (!Object.hasOwn(overrides, 'cameraFramingPreset')) delete clip.cameraFramingPreset;
  return clip;
};

const cursorPresentation = (
  motion = { preset: 'smooth', smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
) => ({
  selectedCursor: 'automatic',
  size: 45,
  color: '#000000',
  shadow: { enabled: true, blur: 6, color: '#000000', direction: 'bottom' },
  clickEffects: {
    left: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#ff5a1f' },
    right: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#6366f1' },
  },
  motion,
});

const audioClip = (assetId, overrides = {}) => ({
  id: 'clip-audio',
  kind: 'audio',
  name: 'Audio',
  assetId,
  role: 'imported',
  volume: 100,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 1,
  ...overrides,
});

const captionStyle = (overrides = {}) => ({
  color: '#ffffff',
  fontSize: 42,
  wrap: true,
  shadowColor: '#000000',
  shadowBlur: 4,
  backdropBlur: 0,
  outlineColor: '#000000',
  outlineWidth: 6,
  extrusionDepth: 4,
  placement: 'bottom',
  ...overrides,
});

const canonicalCaptionStyle = (overrides = {}) => ({
  ...captionStyle(),
  fontFamily: 'sans-serif',
  fontWeight: 800,
  fontStyle: 'normal',
  textDecoration: 'none',
  textAlign: 'center',
  lineHeight: 1.2,
  letterSpacing: 0,
  ...overrides,
});

const textCaption = (overrides = {}) => ({
  type: 'text',
  sentences: [{ id: 'sentence', text: 'Caption', startMs: 0, endMs: 1_000, words: [] }],
  style: captionStyle(),
  ...overrides,
});

const keyboardCaption = (overrides = {}) => ({
  type: 'keyboard',
  steps: [
    { offsetMs: 0, modifiers: ['control'], key: 'k' },
    { offsetMs: 240, modifiers: ['control'], key: 'c' },
  ],
  followCursor: false,
  recordedPlatform: 'linux',
  sourceSessionId: 'session-keyboard',
  style: captionStyle(),
  ...overrides,
});

const captionClip = (caption, overrides = {}) => ({
  id: 'clip-caption',
  kind: 'caption',
  name: 'Caption',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  caption,
  ...overrides,
});

test('imports allowed project media and rejects unsupported extensions', () => {
  const { directory } = setup();
  const source = path.join(directory, 'voice.wav');
  fs.writeFileSync(source, 'sound');
  const asset = importMedia(directory, { kind: 'audio', source });
  assert.equal(asset.kind, 'audio');
  assert.match(asset.src, /^file:/);
  assert.ok(fs.existsSync(path.join(directory, 'media', asset.fileName)));

  const unsafe = path.join(directory, 'unsafe.exe');
  fs.writeFileSync(unsafe, 'no');
  assert.throws(() => importMedia(directory, { kind: 'video', source: unsafe }), /non autorisé/);
});

test('rejects GIF media with an explicit unsupported-format error', () => {
  const { directory } = setup();
  const source = path.join(directory, 'animated.gif');
  fs.writeFileSync(source, 'GIF89a');

  assert.throws(() => importMedia(directory, { kind: 'image', source }), /GIF not supported/);
});

test('normalizes canonical clip timing, linked groups and appearance', () => {
  const asset = {
    id: 'asset-video',
    kind: 'video',
    name: 'Video',
    fileName: 'video.mp4',
    durationMs: 2_000,
    width: 1920,
    height: 1080,
    origin: 'project',
  };
  const groupId = 'recording';
  const normalized = normalizeComposition({
    schemaVersion: 8,
    assets: [asset],
    keyboardCaptionSessions: [],
    clips: [
      visualClip(asset.id, {
        groupId,
        appearance: {
          cornerRadius: 37,
          shadowSize: 'sm',
          shadowBlur: 40,
          shadowMode: 'solid',
          shadowColor: '#112233',
          shadowDirection: 'bottom',
          borderEnabled: true,
          borderColor: '#abcdef',
          borderWidth: 4,
          frame: 'safari',
          frameTitle: '',
          frameColor: '#c0c0c0',
          frameShowMenu: true,
          frameShowScrollbars: true,
          frameChromeScale: 1,
        },
      }),
      audioClip(asset.id, { groupId }),
    ],
  });
  assert.deepEqual(
    normalized.clips.map((clip) => [clip.kind, clip.groupId, clip.timelineDurationMs]),
    [
      ['video', groupId, 1_000],
      ['audio', groupId, 1_000],
    ],
  );
  assert.deepEqual(normalized.clips[0].appearance, {
    cornerRadius: 37,
    shadowSize: 'sm',
    shadowColor: '#112233',
    shadowDirection: 'bottom',
    borderEnabled: true,
    borderColor: '#abcdef',
    borderWidth: 4,
    frame: 'safari',
    frameTitle: '',
    frameColor: '#c0c0c0',
    frameShowMenu: true,
    frameShowScrollbars: true,
    frameChromeScale: 1,
    shadowBlur: 40,
    shadowMode: 'solid',
  });
});

test('round-trips text and keyboard captions in the canonical composition schema', () => {
  const normalized = normalizeComposition({
    schemaVersion: 8,
    assets: [],
    keyboardCaptionSessions: ['session-keyboard', 'session-keyboard'],
    clips: [
      captionClip(textCaption({ style: canonicalCaptionStyle() })),
      captionClip(keyboardCaption({ style: canonicalCaptionStyle() }), { id: 'clip-keyboard', order: 1 }),
    ],
  });

  assert.equal(normalized.schemaVersion, 8);
  assert.deepEqual(normalized.keyboardCaptionSessions, ['session-keyboard']);
  assert.equal(normalized.clips[0].caption.type, 'text');
  assert.deepEqual(normalized.clips[1].caption, keyboardCaption({ style: canonicalCaptionStyle() }));
});

test('round-trips an assetless blur overlay with its effect settings', () => {
  const normalized = normalizeComposition({
    schemaVersion: 8,
    assets: [],
    keyboardCaptionSessions: [],
    clips: [
      {
        id: 'blur',
        trackId: 'blur',
        kind: 'blur',
        name: 'Blur',
        timelineStartMs: 500,
        timelineDurationMs: 5_000,
        sourceInMs: 0,
        sourceDurationMs: 5_000,
        playbackRate: 1,
        transitions: { entry: null, exit: null },
        enabled: true,
        order: 0,
        transform: { x: 0.2, y: 0.3, width: 0.4, height: 0.25 },
        shape: 'circle',
        mode: 'pixelated',
        strength: 80,
        color: '#123456',
      },
    ],
  });
  assert.deepEqual(normalized.clips[0], {
    id: 'blur',
    trackId: 'blur',
    kind: 'blur',
    assetId: '',
    name: 'Blur',
    timelineStartMs: 500,
    timelineDurationMs: 5_000,
    sourceInMs: 0,
    sourceDurationMs: 5_000,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    enabled: true,
    order: 0,
    transform: { x: 0.2, y: 0.3, width: 0.4, height: 0.25 },
    shape: 'circle',
    mode: 'pixelated',
    strength: 80,
    feather: 0,
    cornerRadius: 0,
    tintOpacity: 0,
    color: '#123456',
  });
});

test('rejects malformed keyboard captions and invalid keyboard session markers', () => {
  const invalidCaptions = [
    keyboardCaption({ steps: [] }),
    keyboardCaption({ steps: [{ offsetMs: -1, modifiers: [], key: 'k' }] }),
    keyboardCaption({
      steps: [
        { offsetMs: 10, modifiers: [], key: 'k' },
        { offsetMs: 9, modifiers: [], key: 'c' },
      ],
    }),
    keyboardCaption({ steps: [{ offsetMs: 0, modifiers: ['control', 'control'], key: 'k' }] }),
    keyboardCaption({ steps: [{ offsetMs: 0, modifiers: ['unknown'], key: 'k' }] }),
    keyboardCaption({ steps: [{ offsetMs: 0, modifiers: [], key: 'unknown' }] }),
    keyboardCaption({ recordedPlatform: 'android' }),
    keyboardCaption({ sourceSessionId: '' }),
  ];

  for (const caption of invalidCaptions)
    assert.throws(
      () =>
        normalizeComposition({
          schemaVersion: 8,
          assets: [],
          keyboardCaptionSessions: [],
          clips: [captionClip(caption)],
        }),
      /caption|étape|session|type/i,
    );

  assert.throws(
    () => normalizeComposition({ schemaVersion: 8, assets: [], keyboardCaptionSessions: [null], clips: [] }),
    /session|caption/i,
  );
});

test('rejects malformed and unknown composition schemas instead of returning an empty composition', () => {
  assert.throws(() => normalizeComposition({ media: [], layers: [] }), /schema|schéma|composition/i);
  assert.throws(() => normalizeComposition({ schemaVersion: 999, assets: [], clips: [] }), /version|schema|schéma/i);
  assert.throws(
    () => normalizeComposition({ schemaVersion: 1, assets: [], clips: 'invalid' }),
    /version|schema|schéma/i,
  );
});

test('migrates legacy composition fields and atomically persists the canonical editor state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-editor-migration-'));
  const store = createProjectStore(root);
  const project = store.create({ name: 'Migration' });
  const directory = store.directoryFor(project.id);
  const manifestPath = path.join(directory, 'project.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.editor = {
    composition: {
      schemaVersion: 1,
      assets: [
        {
          id: 'legacy-screen-asset',
          kind: 'video',
          name: 'Legacy screen',
          fileName: 'screen.mp4',
          durationMs: 1_000,
          width: 1920,
          height: 1080,
          origin: 'project',
        },
      ],
      clips: [
        visualClip('legacy-screen-asset', {
          id: 'legacy-screen',
          kind: 'screen',
          order: 0,
        }),
        {
          id: 'legacy-caption',
          kind: 'caption',
          name: 'Legacy caption',
          timelineStartMs: 0,
          timelineDurationMs: 1_000,
          sourceInMs: 0,
          sourceDurationMs: 1_000,
          playbackRate: 1,
          enabled: true,
          order: 1,
          caption: {
            sentences: [
              {
                id: 'sentence',
                text: 'Legacy caption',
                startMs: 0,
                endMs: 1_000,
                words: [],
              },
            ],
            style: {
              color: '#ffffff',
              fontSize: 42,
              shadowColor: '#000000',
              shadowBlur: 4,
              placement: 'bottom',
              boxColor: '#123456',
              boxPadding: 6,
              boxRadius: 8,
            },
          },
        },
      ],
    },
    zoom: { elements: [], generatedSessions: [] },
    presentation: {
      canvas: { preset: '21:9', width: 2520, height: 1080, showBackground: true },
      selectedBackgroundId: null,
      background: null,
      blurPercent: 0,
      importedBackgrounds: [],
      cursorEffects: {
        left: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#ff5a1f' },
        right: {
          springEnabled: true,
          springIntensity: 50,
          rippleEnabled: true,
          rippleSize: 30,
          rippleColor: '#6366f1',
        },
      },
      cursorMotion: { preset: 'smooth', smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
    },
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const migrated = store.editorState(project.id);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.composition.schemaVersion, 8);
  assert.deepEqual(migrated.composition.keyboardCaptionSessions, []);
  assert.deepEqual(migrated.presentation.canvas, {
    preset: '21:9',
    width: 2520,
    height: 1080,
    showBackground: true,
  });

  const screen = migrated.composition.clips.find((clip) => clip.id === 'legacy-screen');
  assert.ok(screen);
  assert.equal(typeof screen.appearance, 'object');
  assert.equal(screen.isMirrored, false);
  assert.equal(screen.isMirroredY, false);

  const captionClip = migrated.composition.clips.find((clip) => clip.id === 'legacy-caption');
  assert.ok(captionClip);
  assert.equal(captionClip.caption.style.wrap, true);
  assert.equal(captionClip.caption.style.backdropBlur, 0);
  assert.equal(captionClip.caption.style.outlineColor, '#123456');
  assert.equal(captionClip.caption.style.outlineWidth, 6);
  assert.equal(captionClip.caption.style.extrusionDepth, 8);
  assert.equal(captionClip.caption.type, 'text');
  assert.equal(Object.hasOwn(captionClip.caption.style, 'boxColor'), false);
  assert.equal(Object.hasOwn(captionClip.caption.style, 'boxPadding'), false);
  assert.equal(Object.hasOwn(captionClip.caption.style, 'boxRadius'), false);

  const rewritten = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(rewritten.editor.schemaVersion, 3);
  assert.equal(rewritten.editor.composition.schemaVersion, 8);
  assert.deepEqual(rewritten.editor.composition.keyboardCaptionSessions, []);
  assert.equal(rewritten.editor.composition.clips[0].isMirroredY, false);
  assert.equal(fs.existsSync(`${manifestPath}.tmp`), false);
});

test('migrates v2 composition to v8 and records historical project sessions once', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-editor-v2-migration-'));
  const store = createProjectStore(root);
  const project = store.create({ name: 'V2 migration' });
  const directory = store.directoryFor(project.id);
  const manifestPath = path.join(directory, 'project.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.sessions = [
    { sessionId: 'session-old', relativePath: 'session-old' },
    { sessionId: 'session-new', relativePath: 'session-new' },
  ];
  const legacyText = textCaption();
  delete legacyText.type;
  manifest.editor = {
    schemaVersion: 2,
    composition: { schemaVersion: 2, assets: [], clips: [captionClip(legacyText)] },
    zoom: { elements: [], generatedSessions: [] },
    presentation: manifest.editor.presentation,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const migrated = store.editorState(project.id);
  assert.equal(migrated.composition.schemaVersion, 8);
  assert.deepEqual(migrated.composition.keyboardCaptionSessions, ['session-old', 'session-new']);
  assert.equal(migrated.composition.clips[0].caption.type, 'text');

  const rewritten = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(rewritten.editor.schemaVersion, 3);
  assert.equal(rewritten.editor.composition.schemaVersion, 8);
  assert.deepEqual(rewritten.editor.composition.keyboardCaptionSessions, ['session-old', 'session-new']);
  assert.deepEqual(store.editorState(project.id).composition.keyboardCaptionSessions, ['session-old', 'session-new']);

  const direct = migrateComposition(
    { schemaVersion: 2, assets: [], clips: [captionClip({ ...textCaption(), type: undefined })] },
    true,
    ['session-old'],
  );
  assert.equal(direct.schemaVersion, 8);
  assert.deepEqual(direct.keyboardCaptionSessions, ['session-old']);
});

test('migrates v5 captions to v8 with the historical typography defaults', () => {
  const migrated = migrateComposition(
    {
      schemaVersion: 5,
      assets: [],
      keyboardCaptionSessions: [],
      clips: [captionClip(textCaption())],
    },
    true,
    [],
  );

  assert.equal(migrated.schemaVersion, 8);
  assert.deepEqual(migrated.clips[0].caption.style, {
    fontFamily: 'sans-serif',
    fontWeight: 800,
    fontStyle: 'normal',
    textDecoration: 'none',
    textAlign: 'center',
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#ffffff',
    fontSize: 42,
    wrap: true,
    shadowColor: '#000000',
    shadowBlur: 4,
    backdropBlur: 0,
    outlineColor: '#000000',
    outlineWidth: 6,
    extrusionDepth: 4,
    placement: 'bottom',
  });
});

test('migrates v6 compositions by adding empty transitions before writing v8', () => {
  const asset = {
    id: 'asset-video',
    kind: 'video',
    name: 'Video',
    fileName: 'video.mp4',
    durationMs: 1_000,
    width: 1920,
    height: 1080,
    origin: 'project',
  };
  const legacyClip = visualClip(asset.id);
  delete legacyClip.transitions;
  const migrated = migrateComposition({ schemaVersion: 6, assets: [asset], clips: [legacyClip] }, true, []);
  assert.equal(migrated.schemaVersion, 8);
  assert.deepEqual(migrated.clips[0].transitions, { entry: null, exit: null });
});

test('migrates v7 webcam clips to v8 custom presets without changing their render fields', () => {
  const asset = {
    id: 'asset-camera',
    kind: 'video',
    name: 'Camera recording',
    fileName: 'camera.mp4',
    durationMs: 1_000,
    width: 1_280,
    height: 720,
    origin: 'project',
  };
  const camera = webcamClip(asset.id, {
    groupId: 'recording-segment',
    appearance: {
      ...visualClip(asset.id).appearance,
      cornerRadius: 27,
      shadowSize: 'custom',
      shadowBlur: 33,
      shadowMode: 'adaptive',
      shadowColor: '#102030',
      shadowDirection: 'top-left',
      borderEnabled: true,
      borderColor: '#405060',
      borderWidth: 3,
      frame: 'safari',
      frameTitle: 'Camera',
      frameColor: '#708090',
      frameShowMenu: false,
      frameShowScrollbars: false,
      frameChromeScale: 1.2,
    },
  });
  const screen = visualClip(asset.id, {
    id: 'screen',
    kind: 'screen',
    trackId: 'screen-track',
    groupId: 'recording-segment',
  });
  const migrated = migrateComposition(
    { schemaVersion: 7, assets: [asset], keyboardCaptionSessions: [], clips: [screen, camera] },
    true,
    [],
  );
  const migratedCamera = migrated.clips.find((clip) => clip.kind === 'webcam');

  assert.equal(migrated.schemaVersion, 8);
  assert.equal(migratedCamera.cameraLayoutPreset, 'custom');
  assert.equal(migratedCamera.cameraFramingPreset, 'custom');
  assert.equal(migratedCamera.cameraSplitRatio, 0.5);
  assert.equal(migratedCamera.cameraSplitPadding, 0);
  assert.deepEqual(migratedCamera.transform, camera.transform);
  assert.deepEqual(migratedCamera.crop, camera.crop);
  assert.deepEqual(migratedCamera.appearance, camera.appearance);
  assert.equal(migratedCamera.isMirrored, true);
  assert.equal(migratedCamera.isMirroredY, true);
  assert.deepEqual(migratedCamera.transitions, camera.transitions);
  assert.deepEqual(migrated.clips.find((clip) => clip.id === 'screen').transform, screen.transform);
});

test('normalizes a v8 webcam with omitted presets to custom while rejecting explicit invalid values', () => {
  const asset = {
    id: 'asset-camera',
    kind: 'video',
    name: 'Camera recording',
    fileName: 'camera.mp4',
    durationMs: 1_000,
    width: 1_280,
    height: 720,
    origin: 'project',
  };
  const normalized = normalizeComposition({
    schemaVersion: 8,
    assets: [asset],
    keyboardCaptionSessions: [],
    clips: [webcamClip(asset.id)],
  });
  const camera = normalized.clips.find((clip) => clip.kind === 'webcam');

  assert.equal(camera.cameraLayoutPreset, 'custom');
  assert.equal(camera.cameraFramingPreset, 'custom');
  assert.equal(camera.cameraSplitRatio, 0.5);
  assert.equal(camera.cameraSplitPadding, 0);
  assert.deepEqual(camera.transform, { x: 0.17, y: 0.23, width: 0.31, height: 0.27 });
  assert.deepEqual(camera.crop, { x: 0.11, y: 0.07, width: 0.73, height: 0.81 });

  assert.throws(
    () =>
      normalizeComposition({
        schemaVersion: 8,
        assets: [asset],
        keyboardCaptionSessions: [],
        clips: [webcamClip(asset.id, { cameraLayoutPreset: 'invalid', cameraFramingPreset: 'fill' })],
      }),
    /preset|caméra/i,
  );
  assert.throws(
    () =>
      normalizeComposition({
        schemaVersion: 8,
        assets: [asset],
        keyboardCaptionSessions: [],
        clips: [
          webcamClip(asset.id, { cameraLayoutPreset: 'split-left', cameraFramingPreset: 'fill', cameraSplitRatio: 1 }),
        ],
      }),
    /répartition|caméra/i,
  );
  assert.throws(
    () =>
      normalizeComposition({
        schemaVersion: 8,
        assets: [asset],
        keyboardCaptionSessions: [],
        clips: [
          webcamClip(asset.id, {
            cameraLayoutPreset: 'split-left',
            cameraFramingPreset: 'fill',
            cameraSplitPadding: 0.2,
          }),
        ],
      }),
    /espacement|caméra/i,
  );
  assert.throws(
    () =>
      normalizeComposition({
        schemaVersion: 8,
        assets: [asset],
        keyboardCaptionSessions: [],
        clips: [webcamClip(asset.id, { cameraLayoutPreset: 'fullscreen', cameraFramingPreset: 'invalid' })],
      }),
    /preset|caméra/i,
  );
});

test('repairs and persists omitted camera presets when opening an already-v8 project', () => {
  const { directory: root } = setup();
  const store = createProjectStore(root);
  const project = store.create({ name: 'Incomplete v8 camera presets' });
  const source = path.join(root, 'camera.mp4');
  fs.writeFileSync(source, 'camera');
  const imported = store.importEditorMedia(project.id, { kind: 'video', source });
  const projectDirectory = store.directoryFor(project.id);
  const manifestPath = path.join(projectDirectory, 'project.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const asset = { ...imported, durationMs: 1_000, width: 1_280, height: 720 };
  manifest.editor.composition = {
    schemaVersion: 8,
    assets: [asset],
    keyboardCaptionSessions: [],
    clips: [webcamClip(asset.id)],
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const opened = store.editorState(project.id);
  const openedCamera = opened.composition.clips.find((clip) => clip.kind === 'webcam');
  assert.equal(openedCamera.cameraLayoutPreset, 'custom');
  assert.equal(openedCamera.cameraFramingPreset, 'custom');

  const persisted = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const persistedCamera = persisted.editor.composition.clips.find((clip) => clip.kind === 'webcam');
  assert.equal(persistedCamera.cameraLayoutPreset, 'custom');
  assert.equal(persistedCamera.cameraFramingPreset, 'custom');
});

test('rejects unknown camera presets in a canonical v8 webcam clip', () => {
  const asset = {
    id: 'asset-camera',
    kind: 'video',
    name: 'Camera recording',
    fileName: 'camera.mp4',
    durationMs: 1_000,
    width: 1_280,
    height: 720,
    origin: 'project',
  };
  assert.throws(
    () =>
      normalizeComposition({
        schemaVersion: 8,
        assets: [asset],
        keyboardCaptionSessions: [],
        clips: [webcamClip(asset.id, { cameraLayoutPreset: 'invalid', cameraFramingPreset: 'fill' })],
      }),
    /preset|caméra/i,
  );
});

test('validates canonical transition presets, durations, domains, and edge budget', () => {
  const asset = {
    id: 'asset-video',
    kind: 'video',
    name: 'Video',
    fileName: 'video.mp4',
    durationMs: 1_000,
    width: 1920,
    height: 1080,
    origin: 'project',
  };
  const canonical = (clip) =>
    normalizeComposition({ schemaVersion: 8, assets: [asset], clips: [clip], keyboardCaptionSessions: [] });
  const valid = visualClip(asset.id, {
    transitions: {
      entry: { preset: { kind: 'slide', direction: 'left' }, durationMs: 250 },
      exit: { preset: { kind: 'zoom', direction: 'out' }, durationMs: 250 },
    },
  });
  assert.deepEqual(canonical(valid).clips[0].transitions, valid.transitions);
  assert.throws(
    () =>
      canonical(
        visualClip(asset.id, {
          transitions: { entry: { preset: { kind: 'slide', direction: 'diagonal' }, durationMs: 100 }, exit: null },
        }),
      ),
    /Direction|transition/i,
  );
  assert.throws(
    () =>
      canonical(
        visualClip(asset.id, {
          transitions: { entry: { preset: { kind: 'fade', extra: true }, durationMs: 100 }, exit: null },
        }),
      ),
    /paramètres|preset|transition/i,
  );
  assert.throws(
    () =>
      canonical(
        visualClip(asset.id, {
          transitions: { entry: { preset: { kind: 'fade' }, durationMs: 101.5 }, exit: null },
        }),
      ),
    /transition|durée/i,
  );
  assert.throws(
    () =>
      normalizeComposition({
        schemaVersion: 8,
        assets: [
          asset,
          { ...asset, id: 'asset-audio', kind: 'audio', fileName: 'audio.wav', width: null, height: null },
        ],
        clips: [
          audioClip('asset-audio', {
            transitions: { entry: { preset: { kind: 'slide', direction: 'left' }, durationMs: 100 }, exit: null },
          }),
        ],
        keyboardCaptionSessions: [],
      }),
    /preset|transition/i,
  );
  assert.throws(
    () =>
      canonical(
        visualClip(asset.id, {
          transitions: {
            entry: { preset: { kind: 'fade' }, durationMs: 600 },
            exit: { preset: { kind: 'blur' }, durationMs: 600 },
          },
        }),
      ),
    /durée|transition/i,
  );
});

test('preserves every supported non-custom canvas preset through editor-state persistence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-editor-canvas-presets-'));
  const store = createProjectStore(root);
  const project = store.create({ name: 'Canvas presets' });
  const expected = {
    '3:4': [1080, 1440],
    '4:3': [1440, 1080],
    '21:9': [2520, 1080],
  };

  for (const [preset, [width, height]] of Object.entries(expected)) {
    const state = store.editorState(project.id);
    state.presentation.canvas = { preset, width, height, showBackground: true };
    const saved = store.saveEditorState(project.id, state);
    const loaded = store.editorState(project.id);
    assert.equal(saved.presentation.canvas.preset, preset);
    assert.deepEqual(loaded.presentation.canvas, { preset, width, height, showBackground: true });
  }
});

test('rejects an unknown persisted composition version without replacing it with an empty composition', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-editor-unknown-schema-'));
  const store = createProjectStore(root);
  const project = store.create({ name: 'Unknown schema' });
  const directory = store.directoryFor(project.id);
  const manifestPath = path.join(directory, 'project.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.editor.composition = { schemaVersion: 999, assets: [], clips: [] };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  assert.throws(() => store.editorState(project.id), /version|schema|schéma/i);
  const unchanged = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(unchanged.editor.composition.schemaVersion, 999);
});

test('materializes project and recording assets without persisting runtime URLs', () => {
  const { directory } = setup();
  fs.mkdirSync(path.join(directory, 'media'));
  fs.writeFileSync(path.join(directory, 'media', 'video.mp4'), 'video');
  const composition = normalizeComposition({
    schemaVersion: 8,
    keyboardCaptionSessions: [],
    assets: [
      {
        id: 'asset-video',
        kind: 'video',
        name: 'Video',
        fileName: 'video.mp4',
        durationMs: 1_000,
        width: 1920,
        height: 1080,
        origin: 'project',
      },
    ],
    clips: [visualClip('asset-video')],
  });
  const materialized = materializeComposition(
    directory,
    composition,
    () => null,
    () => 'project-media://asset/video',
  );
  assert.equal(materialized.assets[0].src, 'project-media://asset/video');
  assert.equal(Object.hasOwn(composition.assets[0], 'src'), false);
});

test('prunes only project media that is no longer referenced', () => {
  const { directory } = setup();
  fs.mkdirSync(path.join(directory, 'media'));
  fs.writeFileSync(path.join(directory, 'media', 'unused.mp4'), 'video');
  const previous = {
    schemaVersion: 8,
    keyboardCaptionSessions: [],
    assets: [
      {
        id: 'unused',
        kind: 'video',
        name: 'Unused',
        fileName: 'unused.mp4',
        durationMs: 1_000,
        width: 1,
        height: 1,
        origin: 'project',
      },
    ],
    clips: [visualClip('unused')],
  };
  pruneProjectMedia(directory, previous, emptyComposition());
  assert.equal(fs.existsSync(path.join(directory, 'media', 'unused.mp4')), false);
});

test('persists and reads one atomic editor state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-editor-state-'));
  const store = createProjectStore(root);
  const project = store.create({ name: 'State' });
  const source = path.join(root, 'clip.mp4');
  fs.writeFileSync(source, 'video');
  const asset = store.importEditorMedia(project.id, { kind: 'video', source });
  const composition = {
    schemaVersion: 8,
    keyboardCaptionSessions: [],
    assets: [{ ...asset, durationMs: 1_000 }],
    clips: [visualClip(asset.id)],
  };
  const saved = store.saveEditorState(project.id, {
    schemaVersion: 3,
    composition,
    zoom: { elements: [], generatedSessions: [] },
    presentation: {
      canvas: { preset: '16:9', width: 1920, height: 1080, showBackground: true },
      selectedBackgroundId: null,
      background: null,
      blurPercent: 0,
      importedBackgrounds: [],
      cursor: cursorPresentation({ preset: 'custom', smoothing: 0.55, springMassMultiplier: 1.1, motionBlur: 0.2 }),
    },
  });
  assert.equal(saved.schemaVersion, 3);
  assert.equal(saved.composition.clips[0].id, 'clip-video');
  assert.match(saved.composition.assets[0].src, /^project-media:/);
  assert.deepEqual(saved.presentation.canvas, { preset: '16:9', width: 1920, height: 1080, showBackground: true });
  assert.deepEqual(saved.presentation.cursor.motion, {
    preset: 'custom',
    smoothing: 0.55,
    springMassMultiplier: 1.1,
    motionBlur: 0.2,
  });
});

test('returns opaque project-media URLs for editor session assets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-editor-media-'));
  const store = createProjectStore(root);
  const project = store.create({ name: 'Opaque media' });
  const directory = store.directoryFor(project.id);
  const sessionId = 'session-opaque';
  const sessionDirectory = path.join(directory, 'sessions', sessionId);
  const screenDirectory = path.join(sessionDirectory, 'screen');
  fs.mkdirSync(screenDirectory, { recursive: true });
  fs.writeFileSync(path.join(screenDirectory, 'capture.mp4'), 'video');
  fs.writeFileSync(
    path.join(sessionDirectory, 'manifest.json'),
    JSON.stringify({
      tracks: [{ segments: [{ path: 'screen/capture.mp4', startMs: 0, durationMs: 1_000 }] }],
    }),
  );

  const manifestPath = path.join(directory, 'project.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.sessions = [{ sessionId, relativePath: path.join('sessions', sessionId) }];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const data = store.editorData(project.id);
  assert.ok(data);
  const segmentSrc = data.tracks[0].assets[0].src;
  assert.match(segmentSrc, /^project-media:/);
  assert.doesNotMatch(segmentSrc, /^file:/);
  assert.match(data.videoSrc, /^project-media:/);
  assert.doesNotMatch(data.videoSrc, /^file:/);
});

test('returns an opaque project-media URL for project previews', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-project-preview-'));
  const store = createProjectStore(root);
  const project = store.create({ name: 'Opaque preview' });
  const directory = store.directoryFor(project.id);
  const sessionId = 'session-preview';
  const screenDirectory = path.join(directory, 'sessions', sessionId, 'screen');
  fs.mkdirSync(screenDirectory, { recursive: true });
  fs.writeFileSync(path.join(screenDirectory, 'capture.mp4'), 'video');

  const manifestPath = path.join(directory, 'project.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.sessions = [{ sessionId, relativePath: path.join('sessions', sessionId) }];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const previewSrc = store.list().find((entry) => entry.id === project.id)?.previewSrc;
  assert.match(previewSrc, /^project-media:\/\/asset\//);
  assert.doesNotMatch(previewSrc, /^file:/);
  assert.ok(store.mediaFileForUrl(previewSrc));
});

test('imports dropped project media safely and never returns a local path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-dropped-media-'));
  const store = createProjectStore(root);
  const project = store.create({ name: 'Dropped media' });
  const source = path.join(root, 'recording.mp4');
  fs.writeFileSync(source, 'video');

  const imported = store.importDroppedProjectMedia(project.id, { kind: 'video', source });
  assert.equal(imported.kind, 'video');
  assert.match(imported.src, /^project-media:/);
  assert.doesNotMatch(imported.src, /^file:/);
  assert.ok(fs.existsSync(path.join(store.directoryFor(project.id), 'media', imported.fileName)));
  assert.doesNotMatch(JSON.stringify(imported), /file:|recording\.mp4/);

  const audio = path.join(root, 'voice.wav');
  fs.writeFileSync(audio, 'audio');
  assert.throws(
    () => store.importDroppedProjectMedia(project.id, { kind: 'video', source: audio }),
    /non autorisé|invalide/i,
  );

  const folder = path.join(root, 'folder.mp4');
  fs.mkdirSync(folder);
  assert.throws(
    () => store.importDroppedProjectMedia(project.id, { kind: 'video', source: folder }),
    /invalide|fichier|directory/i,
  );
  assert.throws(() => store.importDroppedProjectMedia(project.id, { kind: 'video', source: '' }), /invalide|chemin/i);
});

test('normalizes the v7 visual track identity and preserves it through editor-state round trips', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-editor-track-id-'));
  const store = createProjectStore(root);
  const project = store.create({ name: 'Track identity' });
  const source = path.join(root, 'clip.mp4');
  fs.writeFileSync(source, 'video');
  const asset = store.importEditorMedia(project.id, { kind: 'video', source });
  const trackId = 'visual-track-1';
  const state = store.editorState(project.id);
  state.composition = {
    schemaVersion: 8,
    keyboardCaptionSessions: [],
    assets: [{ ...asset, durationMs: 2_000 }],
    clips: [
      visualClip(asset.id, { id: 'left', trackId, timelineDurationMs: 1_000, sourceDurationMs: 1_000 }),
      visualClip(asset.id, {
        id: 'right',
        trackId,
        timelineStartMs: 1_000,
        timelineDurationMs: 1_000,
        sourceInMs: 1_000,
        sourceDurationMs: 1_000,
        order: 1,
      }),
    ],
  };

  const saved = store.saveEditorState(project.id, state);
  assert.equal(saved.composition.schemaVersion, 8);
  assert.deepEqual(
    saved.composition.clips.map((clip) => clip.trackId),
    [trackId, trackId],
  );
  assert.deepEqual(
    store.editorState(project.id).composition.clips.map((clip) => clip.trackId),
    [trackId, trackId],
  );
});

test('migrates only certain contiguous v3 visual fragments into one track', () => {
  const asset = {
    id: 'asset-video',
    kind: 'video',
    name: 'Video',
    fileName: 'video.mp4',
    durationMs: 3_000,
    width: 1920,
    height: 1080,
    origin: 'project',
  };
  const migrated = migrateComposition(
    {
      schemaVersion: 3,
      assets: [asset],
      clips: [
        visualClip(asset.id, { id: 'certain-left', timelineDurationMs: 1_000, sourceDurationMs: 1_000 }),
        visualClip(asset.id, {
          id: 'certain-right',
          timelineStartMs: 1_000,
          timelineDurationMs: 1_000,
          sourceInMs: 1_000,
          sourceDurationMs: 1_000,
        }),
        visualClip(asset.id, {
          id: 'ambiguous',
          timelineStartMs: 1_500,
          timelineDurationMs: 1_000,
          sourceInMs: 1_500,
          sourceDurationMs: 1_000,
        }),
      ],
    },
    true,
    [],
  );

  assert.equal(migrated.schemaVersion, 8);
  const certain = migrated.clips.filter((clip) => clip.id.startsWith('certain-'));
  assert.equal(certain.length, 2);
  assert.ok(certain[0].trackId);
  assert.equal(certain[0].trackId, certain[1].trackId);
  assert.notEqual(migrated.clips.find((clip) => clip.id === 'ambiguous').trackId, certain[0].trackId);
});

test('rejects invalid visual track identities and overlapping clips assigned to one track', () => {
  const asset = {
    id: 'asset-video',
    kind: 'video',
    name: 'Video',
    fileName: 'video.mp4',
    durationMs: 2_000,
    width: 1920,
    height: 1080,
    origin: 'project',
  };
  const base = { schemaVersion: 8, assets: [asset], keyboardCaptionSessions: [] };
  assert.throws(
    () => normalizeComposition({ ...base, clips: [visualClip(asset.id, { trackId: '' })] }),
    /track|piste|identit/i,
  );
  assert.throws(
    () =>
      normalizeComposition({
        ...base,
        clips: [
          visualClip(asset.id, { id: 'first', trackId: 'same-track' }),
          visualClip(asset.id, { id: 'second', trackId: 'same-track', timelineStartMs: 500 }),
        ],
      }),
    /overlap|chevauch|track|piste/i,
  );
});

test('migration groups a mixed-order chain of certain v3 split fragments and keeps another track separate', () => {
  const asset = {
    id: 'asset-video',
    kind: 'video',
    name: 'Video',
    fileName: 'video.mp4',
    durationMs: 4_000,
    width: 1920,
    height: 1080,
    origin: 'project',
  };
  const legacyVisual = (id, overrides) => {
    const clip = visualClip(asset.id, { id, ...overrides });
    delete clip.trackId;
    return clip;
  };
  const migrated = migrateComposition(
    {
      schemaVersion: 3,
      assets: [asset],
      clips: [
        legacyVisual('chain-middle', {
          timelineStartMs: 1_000,
          timelineDurationMs: 1_000,
          sourceInMs: 1_000,
          sourceDurationMs: 1_000,
          order: 4,
        }),
        legacyVisual('other-track', {
          timelineStartMs: 500,
          timelineDurationMs: 500,
          sourceInMs: 0,
          sourceDurationMs: 500,
          order: 1,
          transform: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
        }),
        legacyVisual('chain-right', {
          timelineStartMs: 2_000,
          timelineDurationMs: 1_000,
          sourceInMs: 2_000,
          sourceDurationMs: 1_000,
          order: 2,
        }),
        legacyVisual('chain-left', {
          timelineStartMs: 0,
          timelineDurationMs: 1_000,
          sourceInMs: 0,
          sourceDurationMs: 1_000,
          order: 3,
        }),
      ],
    },
    true,
    [],
  );

  const chain = migrated.clips.filter((clip) => clip.id.startsWith('chain-'));
  assert.equal(chain.length, 3);
  assert.equal(new Set(chain.map((clip) => clip.trackId)).size, 1);
  assert.notEqual(migrated.clips.find((clip) => clip.id === 'other-track').trackId, chain[0].trackId);
});

test('migrates Golden Canvas 2 v4 screen fragments to v8 without losing visual properties', () => {
  const asset = {
    id: 'session:golden-canvas:screen:segment-0001.mp4',
    kind: 'video',
    name: 'Screen recording',
    fileName: null,
    durationMs: 7_513,
    width: 1920,
    height: 1080,
    origin: 'session',
    sessionId: 'golden-canvas',
    sessionPath: 'screen/segment-0001.mp4',
  };
  const first = visualClip(asset.id, {
    id: 'screen',
    trackId: 'screen',
    timelineStartMs: 0,
    timelineDurationMs: 580,
    sourceInMs: 0,
    sourceDurationMs: 580,
    transform: {
      x: 0.16828039203811374,
      y: 0.16828039203811374,
      width: 0.8317196079618863,
      height: 0.8317196079618863,
    },
    appearance: { ...visualClip(asset.id).appearance, shadowSize: 'md' },
  });
  const second = visualClip(asset.id, {
    id: '64527578-9583-414d-ba72-9de1643c45eb',
    trackId: '64527578-9583-414d-ba72-9de1643c45eb',
    timelineStartMs: 580,
    timelineDurationMs: 6_933,
    sourceInMs: 580,
    sourceDurationMs: 6_933,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    appearance: { ...visualClip(asset.id).appearance, shadowSize: 'custom' },
  });
  const third = visualClip(asset.id, {
    id: 'non-continuous',
    trackId: 'non-continuous',
    timelineStartMs: 8_000,
    timelineDurationMs: 500,
    sourceInMs: 8_000,
    sourceDurationMs: 500,
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-golden-canvas-migration-'));
  const store = createProjectStore(root);
  const project = store.create({ name: 'Golden Canvas 2' });
  const directory = store.directoryFor(project.id);
  const manifestPath = path.join(directory, 'project.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.editor.composition = { schemaVersion: 4, assets: [asset], clips: [first, second, third] };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const migrated = store.editorState(project.id);

  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.composition.schemaVersion, 8);
  const migratedFirst = migrated.composition.clips.find((clip) => clip.id === first.id);
  const migratedSecond = migrated.composition.clips.find((clip) => clip.id === second.id);
  const migratedThird = migrated.composition.clips.find((clip) => clip.id === third.id);
  assert.equal(migratedFirst.trackId, migratedSecond.trackId);
  assert.notEqual(migratedThird.trackId, migratedFirst.trackId);
  assert.deepEqual(migratedFirst.transform, first.transform);
  assert.deepEqual(migratedSecond.transform, second.transform);
  assert.equal(migratedFirst.appearance.shadowSize, 'md');
  assert.equal(migratedSecond.appearance.shadowSize, 'custom');

  const persisted = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(persisted.editor.composition.schemaVersion, 7);
  assert.deepEqual(
    persisted.editor.composition.clips.map((clip) => clip.trackId),
    migrated.composition.clips.map((clip) => clip.trackId),
  );
  assert.deepEqual(store.editorState(project.id), migrated);
});
