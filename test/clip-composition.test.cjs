const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
  emptyComposition,
  importMedia,
  materializeComposition,
  normalizeComposition,
  pruneProjectMedia,
} = require('../electron/projects/clip-composition.cjs')
const { createProjectStore } = require('../electron/projects/project-store.cjs')

const setup = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-clips-'))
  return { directory }
}

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
})

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
})

test('imports allowed project media and rejects unsupported extensions', () => {
  const { directory } = setup()
  const source = path.join(directory, 'voice.wav')
  fs.writeFileSync(source, 'sound')
  const asset = importMedia(directory, { kind: 'audio', source })
  assert.equal(asset.kind, 'audio')
  assert.match(asset.src, /^file:/)
  assert.ok(fs.existsSync(path.join(directory, 'media', asset.fileName)))

  const unsafe = path.join(directory, 'unsafe.exe')
  fs.writeFileSync(unsafe, 'no')
  assert.throws(() => importMedia(directory, { kind: 'video', source: unsafe }), /non autorisé/)
})

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
  }
  const groupId = 'recording'
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
  })
  assert.deepEqual(
    normalized.clips.map((clip) => [clip.kind, clip.groupId, clip.timelineDurationMs]),
    [
      ['video', groupId, 1_000],
      ['audio', groupId, 1_000],
    ],
  )
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
  })
})

test('rejects noncanonical editor schemas instead of migrating legacy layers', () => {
  assert.deepEqual(normalizeComposition({ media: [], layers: [] }), emptyComposition())
})

test('materializes project and recording assets without persisting runtime URLs', () => {
  const { directory } = setup()
  fs.mkdirSync(path.join(directory, 'media'))
  fs.writeFileSync(path.join(directory, 'media', 'video.mp4'), 'video')
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
  })
  const materialized = materializeComposition(directory, composition, () => null)
  assert.match(materialized.assets[0].src, /^file:/)
  assert.equal(Object.hasOwn(composition.assets[0], 'src'), false)
})

test('prunes only project media that is no longer referenced', () => {
  const { directory } = setup()
  fs.mkdirSync(path.join(directory, 'media'))
  fs.writeFileSync(path.join(directory, 'media', 'unused.mp4'), 'video')
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
  }
  pruneProjectMedia(directory, previous, emptyComposition())
  assert.equal(fs.existsSync(path.join(directory, 'media', 'unused.mp4')), false)
})

test('persists and reads one atomic editor state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-editor-state-'))
  const store = createProjectStore(root)
  const project = store.create({ name: 'State' })
  const source = path.join(root, 'clip.mp4')
  fs.writeFileSync(source, 'video')
  const asset = store.importEditorMedia(project.id, { kind: 'video', source })
  const composition = {
    schemaVersion: 1,
    assets: [{ ...asset, durationMs: 1_000 }],
    clips: [visualClip(asset.id)],
  }
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
  })
  assert.equal(saved.schemaVersion, 2)
  assert.equal(saved.composition.clips[0].id, 'clip-video')
  assert.match(saved.composition.assets[0].src, /^file:/)
  assert.deepEqual(saved.presentation.canvas, { preset: '16:9', width: 1920, height: 1080, showBackground: true })
  assert.deepEqual(saved.presentation.cursorMotion, {
    preset: 'custom',
    smoothing: 0.55,
    springMassMultiplier: 1.1,
    motionBlur: 0.2,
  })
})
