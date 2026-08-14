const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  emptyComposition,
  importMedia,
  materializeComposition,
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
  ...overrides,
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
    schemaVersion: 1,
    assets: [asset],
    clips: [
      visualClip(asset.id, {
        groupId,
        appearance: {
          cornerRadius: 37,
          shadowSize: 'sm',
          shadowColor: '#112233',
          shadowDirection: 'bottom',
          borderEnabled: true,
          borderColor: '#abcdef',
          borderWidth: 4,
          frame: 'safari',
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

test('rejects noncanonical editor schemas instead of migrating legacy layers', () => {
  assert.deepEqual(normalizeComposition({ media: [], layers: [] }), emptyComposition());
});

test('materializes project and recording assets without persisting runtime URLs', () => {
  const { directory } = setup();
  fs.mkdirSync(path.join(directory, 'media'));
  fs.writeFileSync(path.join(directory, 'media', 'video.mp4'), 'video');
  const composition = normalizeComposition({
    schemaVersion: 1,
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
    schemaVersion: 1,
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
    schemaVersion: 1,
    assets: [{ ...asset, durationMs: 1_000 }],
    clips: [visualClip(asset.id)],
  };
  const saved = store.saveEditorState(project.id, {
    schemaVersion: 2,
    composition,
    zoom: { elements: [], generatedSessions: [] },
    presentation: {
      canvas: { preset: '16:9', width: 1920, height: 1080, showBackground: true },
      selectedBackgroundId: null,
      background: null,
      blurPercent: 0,
      importedBackgrounds: [],
      cursorMotion: { preset: 'custom', smoothing: 0.55, springMassMultiplier: 1.1, motionBlur: 0.2 },
    },
  });
  assert.equal(saved.schemaVersion, 2);
  assert.equal(saved.composition.clips[0].id, 'clip-video');
  assert.match(saved.composition.assets[0].src, /^project-media:/);
  assert.deepEqual(saved.presentation.canvas, { preset: '16:9', width: 1920, height: 1080, showBackground: true });
  assert.deepEqual(saved.presentation.cursorMotion, {
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
  assert.throws(
    () => store.importDroppedProjectMedia(project.id, { kind: 'video', source: '' }),
    /invalide|chemin/i,
  );
});
