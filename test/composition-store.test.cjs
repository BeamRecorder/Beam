const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createCompositionStore } = require('../electron/projects/composition-store.cjs')

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-composition-'))
  const id = '11111111-1111-4111-8111-111111111111'
  const directory = path.join(root, id)
  fs.mkdirSync(directory)
  const file = path.join(directory, 'project.json')
  fs.writeFileSync(file, JSON.stringify({ projectId: id, editor: {} }))
  const readManifest = () => JSON.parse(fs.readFileSync(file, 'utf8'))
  const writeManifest = (_directory, value) => fs.writeFileSync(file, JSON.stringify(value))
  return { root, id, directory, store: createCompositionStore({ directoryFor: () => directory, readManifest, writeManifest }) }
}

test('imports an allowed asset and exposes a project-local file URL', () => {
  const ctx = setup(); const source = path.join(ctx.root, 'voice.wav'); fs.writeFileSync(source, 'sound')
  const asset = ctx.store.importMedia(ctx.id, { kind: 'audio', source })
  assert.equal(asset.kind, 'audio'); assert.match(asset.src, /^file:/); assert.equal(ctx.store.read(ctx.id).media.length, 1)
})
test('rejects unsupported imports before copying a file', () => {
  const ctx = setup(); const source = path.join(ctx.root, 'unsafe.exe'); fs.writeFileSync(source, 'no')
  assert.throws(() => ctx.store.importMedia(ctx.id, { kind: 'video', source }), /non autorisé/)
})
test('persists base-video session speed and trim bounds', () => {
  const ctx = setup()
  ctx.store.save(ctx.id, { media: [], layers: [], sessionSegments: [{ id: 'cut-1', sourceStartMs: 0, sourceEndMs: 10_000, activeStartMs: 500, activeEndMs: 8_000, playbackRate: 1.5, active: true }] })
  assert.deepEqual(ctx.store.read(ctx.id).sessionSegments, [{ id: 'cut-1', sourceStartMs: 0, sourceEndMs: 10_000, activeStartMs: 500, activeEndMs: 8_000, playbackRate: 1.5, active: true }])
})
test('does not expose removed per-layer mutation methods', () => {
  const ctx = setup()
  assert.deepEqual(Object.keys(ctx.store).sort(), ['importMedia', 'read', 'save'])
})
