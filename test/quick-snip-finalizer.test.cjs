const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const { createQuickSnipFinalizer } = require('../electron/quick-snip/quick-snip-finalizer.cjs');

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-quick-snip-finalizer-'));
  const studio = path.join(root, 'studio');
  const raw = path.join(root, 'raw');
  const work = path.join(root, 'work');
  fs.mkdirSync(studio, { recursive: true });
  fs.mkdirSync(raw, { recursive: true });
  fs.mkdirSync(work, { recursive: true });
  return {
    root,
    paths: { quickSnipStudio: studio, quickSnipRaw: raw, quickSnipWork: work },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function writeSource(fixture, relativePath = path.join('work', 'project-1', 'session-1', 'screen', 'native.mp4')) {
  const source = path.join(fixture.root, relativePath);
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, Buffer.from('native-video'));
  return source;
}

function studioProjectStore() {
  const saved = [];
  const state = {
    schemaVersion: 3,
    composition: { schemaVersion: 1, clips: [] },
    zoom: {
      elements: [{ id: 'zoom-1', enabled: true, startMs: 0, endMs: 500 }],
      generatedSessions: [],
      motionBlur: { enabled: true, intensity: 0.55 },
    },
    presentation: { canvas: { preset: '16:9' }, importedBackgrounds: [] },
  };
  return {
    saved,
    editorState: () => JSON.parse(JSON.stringify(state)),
    saveEditorState: (_projectId, next) => {
      saved.push(next);
      return next;
    },
  };
}

test('finalizes Studio output through a partial file and atomically renames it', async () => {
  const fixture = createFixture();
  const projectStore = studioProjectStore();
  const source = writeSource(fixture);
  const progress = [];
  try {
    const finalize = createQuickSnipFinalizer({ userPaths: fixture.paths, projectStore });
    const result = await finalize({
      session: {
        projectId: 'project-1',
        manifestPath: path.join(fixture.paths.quickSnipWork, 'project-1', 'session-1', 'manifest.json'),
        videoSrc: pathToFileURL(source).href,
      },
      configuration: {
        mode: 'studio',
        format: 'mp4',
        name: 'Demo recording',
        automaticZoom: false,
        preset: {
          settings: {
            editor: { presentation: { canvas: { preset: '9:16' } } },
          },
        },
      },
      onProgress: (value) => progress.push(value),
    });

    assert.equal(result.projectId, 'project-1');
    assert.equal(path.basename(result.path), 'Demo recording.mp4');
    assert.deepEqual(fs.readFileSync(result.path), fs.readFileSync(source));
    assert.equal(fs.existsSync(`${result.path}.partial`), false);
    assert.deepEqual(progress, [0.2, 0.9, 1]);
    assert.equal(projectStore.saved.length, 1);
    assert.equal(projectStore.saved[0].zoom.elements[0].enabled, false);
    assert.equal(projectStore.saved[0].presentation.canvas.preset, '9:16');
  } finally {
    fixture.cleanup();
  }
});

test('applies the Studio preset to existing clips without changing their identity, source, or timing', async () => {
  const fixture = createFixture();
  const source = writeSource(fixture);
  const visualDefaults = {
    transform: { x: 0.12, y: 0.18, width: 0.72, height: 0.64 },
    appearance: {
      frame: 'safari',
      frameTitle: 'Preset frame',
      frameColor: '#123456',
      frameShowMenu: false,
      frameShowScrollbars: false,
      frameChromeScale: 0.82,
      shadowSize: 'lg',
      shadowBlur: 28,
      shadowMode: 'adaptive',
      shadowColor: '#654321',
      shadowDirection: 'bottom-right',
      borderEnabled: true,
      borderColor: '#abcdef',
      borderWidth: 3,
      cornerRadius: 'lg',
    },
    isMirrored: true,
    isMirroredY: true,
    playbackRate: 1.25,
    transitions: { entry: null, exit: { preset: { kind: 'fade' }, durationMs: 180 } },
    cameraLayoutPreset: 'floating-bottom-left',
    cameraFramingPreset: 'portrait',
    cameraSplitRatio: 0.63,
    cameraSplitPadding: 0.04,
    reactToZoom: false,
  };
  const webcamDefaults = {
    ...visualDefaults,
    transform: { x: 0.68, y: 0.7, width: 0.28, height: 0.22 },
    cameraLayoutPreset: 'floating-top-right',
    cameraFramingPreset: 'circle',
  };
  const captionStyle = {
    fontFamily: 'Inter',
    fontWeight: 400,
    fontStyle: 'italic',
    textDecoration: 'line-through',
    textAlign: 'left',
    lineHeight: 1.4,
    letterSpacing: 2,
    color: '#facc15',
    fontSize: 56,
    wrap: false,
    shadowColor: '#111827',
    shadowBlur: 12,
    shape: { preset: 'pill', radius: 24, color: '#0f172a', opacity: 72, blur: 9, padding: 18 },
    outlineColor: '#22d3ee',
    outlineWidth: 2,
    extrusionDepth: 1,
    placement: 'top',
    wordHighlight: { enabled: true, displayMode: 'word', fill: 'solid', color: '#22d3ee' },
  };
  const clip = (id, kind, overrides = {}) => ({
    id,
    kind,
    name: `${kind} clip`,
    assetId: `asset-${id}`,
    timelineStartMs: 1_200,
    timelineDurationMs: 2_400,
    sourceInMs: 180,
    sourceDurationMs: 2_400,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    enabled: true,
    order: 0,
    ...overrides,
  });
  const originalState = {
    schemaVersion: 3,
    composition: {
      schemaVersion: 13,
      clips: [
        clip('screen-clip', 'screen', {
          transform: { x: 0, y: 0, width: 1, height: 1 },
          appearance: { frame: 'none' },
        }),
        clip('webcam-clip', 'webcam', {
          transform: { x: 0.8, y: 0.8, width: 0.1, height: 0.1 },
          appearance: { frame: 'none' },
        }),
        clip('audio-clip', 'audio', { volume: 100 }),
        clip('caption-clip', 'caption', {
          caption: {
            type: 'text',
            sentences: [],
            style: { ...captionStyle, customText: 'Keep this video text' },
          },
          transform: { x: 0, y: 0.8, width: 1, height: 0.1 },
        }),
        clip('blur-clip', 'blur', {
          transform: { x: 0, y: 0, width: 0.1, height: 0.1 },
          shape: 'rectangle',
          mode: 'blur',
          strength: 20,
          feather: 0,
          cornerRadius: 0,
          tintOpacity: 0,
          color: '#000000',
        }),
      ],
    },
    zoom: {
      elements: [{ id: 'zoom-keep', sessionId: 'session-1', startMs: 300, endMs: 900, enabled: true }],
      generatedSessions: [],
      motionBlur: { enabled: true, intensity: 0.2 },
    },
    presentation: { canvas: { preset: '16:9' }, importedBackgrounds: [] },
  };
  const identityAndTiming = originalState.composition.clips.map((item) =>
    ['id', 'assetId', 'timelineStartMs', 'timelineDurationMs', 'sourceInMs', 'sourceDurationMs'].reduce(
      (values, key) => ({ ...values, [key]: item[key] }),
      {},
    ),
  );
  let savedState;
  const projectStore = {
    editorState: () => structuredClone(originalState),
    saveEditorState: (_projectId, next) => {
      savedState = next;
      return next;
    },
  };
  const preset = {
    settings: {
      editor: {
        visual: { screen: visualDefaults, webcam: webcamDefaults },
        audio: { volume: 42, playbackRate: 1.5 },
        caption: { style: captionStyle, transform: { x: 0.08, y: 0.12, width: 0.84, height: 0.2 }, durationMs: 900 },
        blur: {
          transform: { x: 0.22, y: 0.24, width: 0.34, height: 0.36 },
          shape: 'circle',
          mode: 'pixelated',
          strength: 88,
          feather: 14,
          cornerRadius: 20,
          tintOpacity: 35,
          color: '#ff00aa',
        },
        zoomMotionBlur: { enabled: false, intensity: 0.77 },
      },
    },
  };

  try {
    const finalize = createQuickSnipFinalizer({ userPaths: fixture.paths, projectStore });
    await finalize({
      session: { projectId: 'project-1', videoSrc: pathToFileURL(source).href },
      configuration: { mode: 'studio', format: 'mp4', name: 'Preset clips', preset, automaticZoom: true },
    });

    assert.ok(savedState);
    const clips = savedState.composition.clips;
    assert.deepEqual(
      clips.map((item) =>
        ['id', 'assetId', 'timelineStartMs', 'timelineDurationMs', 'sourceInMs', 'sourceDurationMs'].reduce(
          (values, key) => ({ ...values, [key]: item[key] }),
          {},
        ),
      ),
      identityAndTiming,
    );
    assert.deepEqual(
      clips.find((item) => item.id === 'screen-clip'),
      { ...originalState.composition.clips[0], ...visualDefaults },
    );
    assert.deepEqual(
      clips.find((item) => item.id === 'webcam-clip'),
      { ...originalState.composition.clips[1], ...webcamDefaults },
    );
    assert.deepEqual(
      clips.find((item) => item.id === 'audio-clip'),
      { ...originalState.composition.clips[2], volume: 42, playbackRate: 1.5 },
    );
    assert.deepEqual(
      clips.find((item) => item.id === 'caption-clip'),
      {
        ...originalState.composition.clips[3],
        caption: {
          ...originalState.composition.clips[3].caption,
          style: { ...captionStyle, customText: 'Keep this video text' },
        },
        transform: { x: 0.08, y: 0.12, width: 0.84, height: 0.2 },
      },
    );
    assert.deepEqual(
      clips.find((item) => item.id === 'blur-clip'),
      { ...originalState.composition.clips[4], ...preset.settings.editor.blur },
    );
    assert.deepEqual(savedState.zoom.motionBlur, { enabled: false, intensity: 0.77 });
  } finally {
    fixture.cleanup();
  }
});

test('allocates collision-free output names, including names blocked by partial files', async () => {
  const fixture = createFixture();
  const source = writeSource(fixture);
  const projectStore = studioProjectStore();
  const finalize = createQuickSnipFinalizer({ userPaths: fixture.paths, projectStore });
  try {
    fs.writeFileSync(path.join(fixture.paths.quickSnipStudio, 'Collision.mp4'), Buffer.from('existing'));
    fs.writeFileSync(path.join(fixture.paths.quickSnipStudio, 'Collision 2.mp4.partial'), Buffer.from('partial'));

    const result = await finalize({
      session: { projectId: 'project-1', videoSrc: pathToFileURL(source).href },
      configuration: { mode: 'studio', format: 'mp4', name: 'Collision' },
    });

    assert.equal(path.basename(result.path), 'Collision 3.mp4');
    assert.equal(fs.existsSync(path.join(fixture.paths.quickSnipStudio, 'Collision 2.mp4.partial')), true);
    assert.equal(fs.existsSync(`${result.path}.partial`), false);
  } finally {
    fixture.cleanup();
  }
});

test('writes Raw output and removes the temporary work project after success', async () => {
  const fixture = createFixture();
  const source = writeSource(fixture);
  const projectDirectory = path.join(fixture.paths.quickSnipWork, 'project-1');
  const projectStore = {
    editorState: () => {
      throw new Error('Raw Quick Snip must not load editor state.');
    },
    saveEditorState: () => {
      throw new Error('Raw Quick Snip must not save editor state.');
    },
  };
  try {
    const finalize = createQuickSnipFinalizer({ userPaths: fixture.paths, projectStore });
    const result = await finalize({
      session: {
        manifestPath: path.join(projectDirectory, 'session-1', 'manifest.json'),
        videoSrc: pathToFileURL(source).href,
      },
      configuration: { mode: 'raw', format: 'mp4', name: 'Raw clip' },
    });

    assert.equal(result.projectId, null);
    assert.equal(path.dirname(result.path), fixture.paths.quickSnipRaw);
    assert.deepEqual(fs.readFileSync(result.path), Buffer.from('native-video'));
    assert.equal(fs.existsSync(projectDirectory), false);
  } finally {
    fixture.cleanup();
  }
});

test('rejects WebM instead of silently producing an MP4 with the wrong extension', async () => {
  const fixture = createFixture();
  const source = writeSource(fixture);
  try {
    const finalize = createQuickSnipFinalizer({ userPaths: fixture.paths, projectStore: studioProjectStore() });
    await assert.rejects(
      () =>
        finalize({
          session: { videoSrc: pathToFileURL(source).href },
          configuration: { mode: 'raw', format: 'webm', name: 'WebM clip' },
        }),
      /WebM Quick Snip export requires the renderer export pipeline/,
    );
    assert.deepEqual(fs.readdirSync(fixture.paths.quickSnipRaw), []);
  } finally {
    fixture.cleanup();
  }
});

test('cancelling Studio finalization removes a renamed output and any partial file', async () => {
  const fixture = createFixture();
  const source = writeSource(fixture);
  const abortController = new AbortController();
  try {
    const finalize = createQuickSnipFinalizer({ userPaths: fixture.paths, projectStore: studioProjectStore() });
    await assert.rejects(
      () =>
        finalize({
          signal: abortController.signal,
          session: { projectId: 'project-1', videoSrc: pathToFileURL(source).href },
          configuration: { mode: 'studio', format: 'mp4', name: 'Cancelled Studio' },
          onProgress: (progress) => {
            if (progress === 0.9) abortController.abort();
          },
        }),
      /cancel|abort/i,
    );

    const output = path.join(fixture.paths.quickSnipStudio, 'Cancelled Studio.mp4');
    assert.equal(fs.existsSync(output), false);
    assert.equal(fs.existsSync(`${output}.partial`), false);
  } finally {
    fixture.cleanup();
  }
});

test('cancelling Raw finalization removes output, partial data and the temporary work project', async () => {
  const fixture = createFixture();
  const source = writeSource(fixture);
  const projectDirectory = path.join(fixture.paths.quickSnipWork, 'project-1');
  const abortController = new AbortController();
  try {
    const finalize = createQuickSnipFinalizer({ userPaths: fixture.paths, projectStore: studioProjectStore() });
    await assert.rejects(
      () =>
        finalize({
          signal: abortController.signal,
          session: {
            manifestPath: path.join(projectDirectory, 'session-1', 'manifest.json'),
            videoSrc: pathToFileURL(source).href,
          },
          configuration: { mode: 'raw', format: 'mp4', name: 'Cancelled Raw' },
          onProgress: (progress) => {
            if (progress === 0.9) abortController.abort();
          },
        }),
      /cancel|abort/i,
    );

    const output = path.join(fixture.paths.quickSnipRaw, 'Cancelled Raw.mp4');
    assert.equal(fs.existsSync(output), false);
    assert.equal(fs.existsSync(`${output}.partial`), false);
    assert.equal(fs.existsSync(projectDirectory), false);
  } finally {
    fixture.cleanup();
  }
});
