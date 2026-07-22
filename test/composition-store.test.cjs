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
