const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createCompositionStore } = require('../electron/projects/composition-store.cjs')
const { createProjectStore } = require('../electron/projects/project-store.cjs')

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-composition-')); const id = '11111111-1111-4111-8111-111111111111'; const directory = path.join(root, id)
  fs.mkdirSync(directory); const manifest = { projectId: id, editor: {} }; const readManifest = () => JSON.parse(fs.readFileSync(path.join(directory, 'project.json'), 'utf8')); const writeManifest = (_directory, value) => fs.writeFileSync(path.join(directory, 'project.json'), JSON.stringify(value))
  writeManifest(directory, manifest)
  return { root, id, directory, store: createCompositionStore({ directoryFor: () => directory, readManifest, writeManifest }) }
}
test('imports an allowed file into project media and exposes only a file URL', () => {
  const ctx = setup(); const source = path.join(ctx.root, 'voice.wav'); fs.writeFileSync(source, 'sound')
  const asset = ctx.store.importMedia(ctx.id, { kind: 'audio', source }); assert.equal(asset.kind, 'audio'); assert.match(asset.src, /^file:/); assert.ok(fs.existsSync(path.join(ctx.directory, 'media', asset.fileName))); assert.equal(ctx.store.read(ctx.id).media.length, 1)
})
test('rejects unsupported media extensions before copying', () => {
  const ctx = setup(); const source = path.join(ctx.root, 'unsafe.exe'); fs.writeFileSync(source, 'no')
  assert.throws(() => ctx.store.importMedia(ctx.id, { kind: 'video', source }), /non autorisé/); assert.equal(fs.existsSync(path.join(ctx.directory, 'media')), false)
})
test('deleting the final media layer removes its unreferenced asset', () => {
  const ctx = setup(); const source = path.join(ctx.root, 'clip.mp4'); fs.writeFileSync(source, 'video'); const asset = ctx.store.importMedia(ctx.id, { kind: 'video', source }); const layer = { id: '22222222-2222-4222-8222-222222222222', kind: 'video', name: 'clip', assetId: asset.id, startMs: 0, endMs: 1000, enabled: true, order: 0, transform: { x: 0, y: 0, width: 1, height: 1 } }
  ctx.store.upsertLayer(ctx.id, layer); const composition = ctx.store.removeLayer(ctx.id, layer.id); assert.equal(composition.media.length, 0); assert.equal(fs.existsSync(path.join(ctx.directory, 'media', asset.fileName)), false)
})
test('persists normalized webcam placement in the project manifest', () => {
  const ctx = setup(); const source = path.join(ctx.root, 'camera.mp4'); fs.writeFileSync(source, 'video'); const asset = ctx.store.importMedia(ctx.id, { kind: 'video', source })
  const layer = { id: '33333333-3333-4333-8333-333333333333', kind: 'video', name: 'Webcam', assetId: asset.id, startMs: 0, endMs: 1000, enabled: true, order: 0, transform: { x: .12, y: .34, width: .28, height: .21 }, reactToZoom: true }
  ctx.store.upsertLayer(ctx.id, layer)
  assert.deepEqual(ctx.store.read(ctx.id).layers[0].transform, layer.transform)
})
test('migrates missing border and frame appearance values without changing their visual default', () => {
  const ctx = setup(); const source = path.join(ctx.root, 'appearance.png'); fs.writeFileSync(source, 'image'); const asset = ctx.store.importMedia(ctx.id, { kind: 'image', source })
  const layer = { id: '12121212-1212-4121-8121-121212121212', kind: 'image', name: 'Image', assetId: asset.id, startMs: 0, endMs: 1000, enabled: true, order: 0, transform: { x: 0, y: 0, width: 1, height: 1 }, appearance: { shadowSize: 'sm', cornerRadius: 'sm', shadowColor: '#112233', shadowDirection: 'bottom' } }
  ctx.store.upsertLayer(ctx.id, layer); assert.deepEqual(ctx.store.read(ctx.id).layers[0].appearance, { ...layer.appearance, borderEnabled: false, borderColor: '#000000', borderWidth: 1, frame: 'none', frameTitle: '', frameColor: '#c0c0c0', frameShowMenu: true, frameShowScrollbars: true })
})
test('bounds persisted border values and rejects unknown frame and color values', () => {
  const ctx = setup(); const source = path.join(ctx.root, 'frame.png'); fs.writeFileSync(source, 'image'); const asset = ctx.store.importMedia(ctx.id, { kind: 'image', source })
  const layer = { id: '13131313-1313-4131-8131-131313131313', kind: 'image', name: 'Image', assetId: asset.id, startMs: 0, endMs: 1000, enabled: true, order: 0, transform: { x: 0, y: 0, width: 1, height: 1 }, appearance: { shadowSize: 'none', cornerRadius: 'none', shadowColor: 'bad', shadowDirection: 'bad', borderEnabled: true, borderColor: 'bad', borderWidth: 999, frame: 'other' } }
  ctx.store.upsertLayer(ctx.id, layer); assert.deepEqual(ctx.store.read(ctx.id).layers[0].appearance, { shadowSize: 'none', cornerRadius: 'none', shadowColor: '#000000', shadowDirection: 'all', borderEnabled: true, borderColor: '#000000', borderWidth: 32, frame: 'none', frameTitle: '', frameColor: '#c0c0c0', frameShowMenu: true, frameShowScrollbars: true })
})
test('keeps a legacy custom corner radius while adding a frame appearance', () => {
  const ctx = setup(); const source = path.join(ctx.root, 'legacy-frame.png'); fs.writeFileSync(source, 'image'); const asset = ctx.store.importMedia(ctx.id, { kind: 'image', source })
  const layer = { id: '14141414-1414-4141-8141-141414141414', kind: 'image', name: 'Image', assetId: asset.id, startMs: 0, endMs: 1000, enabled: true, order: 0, transform: { x: 0, y: 0, width: 1, height: 1 }, appearance: { shadowSize: 'sm', cornerRadius: 37, shadowColor: '#112233', shadowDirection: 'bottom', borderEnabled: true, borderColor: '#abcdef', borderWidth: 4, frame: 'safari' } }
  ctx.store.upsertLayer(ctx.id, layer); assert.deepEqual(ctx.store.read(ctx.id).layers[0].appearance, { ...layer.appearance, frameTitle: '', frameColor: '#c0c0c0', frameShowMenu: true, frameShowScrollbars: true })
})
test('keeps linked audio timing fields when a video asset is shared by video and audio clips', () => {
  const ctx = setup(); const source = path.join(ctx.root, 'linked.mp4'); fs.writeFileSync(source, 'video'); const asset = ctx.store.importMedia(ctx.id, { kind: 'video', source })
  const groupId = '44444444-4444-4444-8444-444444444444'
  const video = { id: '55555555-5555-4555-8555-555555555555', kind: 'video', name: 'Video', assetId: asset.id, startMs: 10, endMs: 1_000, enabled: true, order: 0, groupId, transform: { x: 0, y: 0, width: 1, height: 1 }, sourceOffsetMs: 20, playbackRate: 1.25 }
  const audio = { id: '66666666-6666-4666-8666-666666666666', kind: 'audio', name: 'Audio', assetId: asset.id, startMs: 10, endMs: 1_000, enabled: true, order: 1, groupId, sourceOffsetMs: 20, playbackRate: 1.25 }
  ctx.store.upsertLayer(ctx.id, video); ctx.store.upsertLayer(ctx.id, audio)
  const saved = ctx.store.read(ctx.id).layers
  assert.deepEqual(saved.map((layer) => [layer.kind, layer.groupId, layer.sourceOffsetMs, layer.playbackRate]), [['video', groupId, 20, 1.25], ['audio', groupId, 20, 1.25]])
})
test('persists base video cut points in the project composition', () => {
  const ctx = setup()
  ctx.store.save(ctx.id, { media: [], layers: [], baseVideoCuts: [4_000, 1_500, 4_000] })
  assert.deepEqual(ctx.store.read(ctx.id).baseVideoCuts, [1_500, 4_000])
})
test('moves media layers across visual lanes and renormalizes their order', () => {
  const ctx = setup(); const source = path.join(ctx.root, 'layer.png'); fs.writeFileSync(source, 'image'); const asset = ctx.store.importMedia(ctx.id, { kind: 'image', source })
  const layer = (id, name) => ({ id, kind: 'image', name, assetId: asset.id, startMs: 0, endMs: 1_000, enabled: true, order: 0, transform: { x: 0, y: 0, width: 1, height: 1 } })
  ctx.store.upsertLayer(ctx.id, layer('77777777-7777-4777-8777-777777777777', 'Back')); ctx.store.upsertLayer(ctx.id, layer('88888888-8888-4888-8888-888888888888', 'Front'))
  const moved = ctx.store.moveLayer(ctx.id, '88888888-8888-4888-8888-888888888888', 0)
  assert.deepEqual(moved.layers.map((item) => [item.name, item.order]), [['Front', 0], ['Back', 1]])
})
test('does not allow audio tracks to be reordered with visual tracks', () => {
  const ctx = setup(); const source = path.join(ctx.root, 'sound.wav'); fs.writeFileSync(source, 'sound'); const asset = ctx.store.importMedia(ctx.id, { kind: 'audio', source })
  ctx.store.upsertLayer(ctx.id, { id: '99999999-9999-4999-8999-999999999999', kind: 'audio', name: 'Sound', assetId: asset.id, startMs: 0, endMs: 1_000, enabled: true, order: 0 })
  assert.throws(() => ctx.store.moveLayer(ctx.id, '99999999-9999-4999-8999-999999999999', 0), /vidéo et image/)
})
test('persists an editor state and materializes imported project backgrounds', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-editor-state-'))
  const store = createProjectStore(root); const project = store.create({ name: 'State' })
  const source = path.join(root, 'background.png'); fs.writeFileSync(source, 'image')
  const background = store.importBackground(project.id, { source })
  const saved = store.saveEditorState(project.id, {
    schemaVersion: 1,
    composition: { media: [], layers: [] },
    zoom: { elements: [], generatedSessions: [] },
    presentation: { canvas: { preset: '16:9', width: 1920, height: 1080, showBackground: true }, selectedBackgroundId: background.id, importedBackgrounds: [background], videoEnabled: true, systemAudioEnabled: false, micAudioEnabled: true },
  })
  assert.equal(saved.presentation.selectedBackgroundId, background.id)
  assert.equal(saved.presentation.importedBackgrounds[0].extension, 'png')
  assert.match(saved.presentation.importedBackgrounds[0].path, /^file:/)
  assert.equal(saved.presentation.canvas.showBackground, true)
})
test('migrates a project without canvas presentation settings to 16:9', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-editor-canvas-'))
  const store = createProjectStore(root); const project = store.create({ name: 'Legacy' })
  const state = store.editorState(project.id)
  assert.deepEqual(state.presentation.canvas, { preset: '16:9', width: 1920, height: 1080, showBackground: true })
})
