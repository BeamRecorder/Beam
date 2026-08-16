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
});

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
    schemaVersion: 3,
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
    schemaVersion: 3,
    assets: [],
    keyboardCaptionSessions: ['session-keyboard', 'session-keyboard'],
    clips: [captionClip(textCaption()), captionClip(keyboardCaption(), { id: 'clip-keyboard', order: 1 })],
  });

  assert.equal(normalized.schemaVersion, 3);
  assert.deepEqual(normalized.keyboardCaptionSessions, ['session-keyboard']);
  assert.equal(normalized.clips[0].caption.type, 'text');
  assert.deepEqual(normalized.clips[1].caption, keyboardCaption());
});

test('round-trips an assetless blur overlay with its effect settings', () => {
  const normalized = normalizeComposition({
    schemaVersion: 3,
    assets: [],
    keyboardCaptionSessions: [],
    clips: [
      {
        id: 'blur',
        kind: 'blur',
        name: 'Blur',
        timelineStartMs: 500,
        timelineDurationMs: 5_000,
        sourceInMs: 0,
        sourceDurationMs: 5_000,
        playbackRate: 1,
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
    kind: 'blur',
    assetId: '',
    name: 'Blur',
    timelineStartMs: 500,
    timelineDurationMs: 5_000,
    sourceInMs: 0,
    sourceDurationMs: 5_000,
    playbackRate: 1,
    enabled: true,
    order: 0,
    transform: { x: 0.2, y: 0.3, width: 0.4, height: 0.25 },
    shape: 'circle',
    mode: 'pixelated',
    strength: 80,
    feather: 0,
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
          schemaVersion: 3,
          assets: [],
          keyboardCaptionSessions: [],
          clips: [captionClip(caption)],
        }),
      /caption|étape|session|type/i,
    );

  assert.throws(
    () => normalizeComposition({ schemaVersion: 3, assets: [], keyboardCaptionSessions: [null], clips: [] }),
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
  assert.equal(migrated.composition.schemaVersion, 3);
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
  assert.equal(rewritten.editor.composition.schemaVersion, 3);
  assert.deepEqual(rewritten.editor.composition.keyboardCaptionSessions, []);
  assert.equal(rewritten.editor.composition.clips[0].isMirroredY, false);
  assert.equal(fs.existsSync(`${manifestPath}.tmp`), false);
});

test('migrates v2 composition to v3 and records historical project sessions once', () => {
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
  assert.equal(migrated.composition.schemaVersion, 3);
  assert.deepEqual(migrated.composition.keyboardCaptionSessions, ['session-old', 'session-new']);
  assert.equal(migrated.composition.clips[0].caption.type, 'text');

  const rewritten = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(rewritten.editor.schemaVersion, 3);
  assert.equal(rewritten.editor.composition.schemaVersion, 3);
  assert.deepEqual(rewritten.editor.composition.keyboardCaptionSessions, ['session-old', 'session-new']);
  assert.deepEqual(store.editorState(project.id).composition.keyboardCaptionSessions, ['session-old', 'session-new']);

  const direct = migrateComposition(
    { schemaVersion: 2, assets: [], clips: [captionClip({ ...textCaption(), type: undefined })] },
    true,
    ['session-old'],
  );
  assert.equal(direct.schemaVersion, 3);
  assert.deepEqual(direct.keyboardCaptionSessions, ['session-old']);
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
    schemaVersion: 3,
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
    schemaVersion: 3,
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
    schemaVersion: 3,
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
