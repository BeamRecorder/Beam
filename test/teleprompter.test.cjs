const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { defaults } = require('../electron/preferences/preferences-store.cjs')
const { createTeleprompterStorage, normalizeTeleprompterDocument } = require('../electron/teleprompter/teleprompter-storage.cjs')
const { clampTeleprompterBounds, isContentProtectionSupported } = require('../electron/teleprompter/teleprompter-window.cjs')

const projectId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const document = { schemaVersion: 1, text: 'Hello\nWorld', mode: 'line-by-line', autoscroll: true, scrollSpeed: 70, fontSize: 36, lineHeight: 1.5, textAlign: 'center', theme: 'dark', updatedAtUtc: '2026-01-01T00:00:00.000Z' }

function storageFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-recorder-teleprompter-'))
  const file = path.join(root, 'session', 'teleprompter.json')
  return { root, file, storage: createTeleprompterStorage({ projectStore: { teleprompterFileFor: () => file } }) }
}

test('normalizes supported values and clamps numeric settings', () => {
  const normalized = normalizeTeleprompterDocument({ ...document, scrollSpeed: 999, fontSize: 1, lineHeight: 9 })
  assert.equal(normalized.scrollSpeed, 200)
  assert.equal(normalized.fontSize, 36)
  assert.equal(normalized.lineHeight, 2.5)
})

test('rejects malformed documents instead of writing arbitrary JSON', () => {
  assert.throws(() => normalizeTeleprompterDocument({ ...document, schemaVersion: 2 }), /Version/)
  assert.throws(() => normalizeTeleprompterDocument({ ...document, mode: 'unknown' }), /Mode/)
  assert.throws(() => normalizeTeleprompterDocument({ ...document, text: 42 }), /Texte/)
})

test('persists and reloads a session document atomically', () => {
  const fixture = storageFixture()
  const saved = fixture.storage.save(projectId, sessionId, document)
  assert.deepEqual(saved, document)
  assert.equal(fs.existsSync(fixture.file), true)
  assert.deepEqual(fixture.storage.get(projectId, sessionId), document)
  fs.rmSync(fixture.root, { recursive: true, force: true })
})

test('returns no document for a valid session that has not been edited', () => {
  const fixture = storageFixture()
  assert.equal(fixture.storage.get(projectId, sessionId), null)
  fs.rmSync(fixture.root, { recursive: true, force: true })
})

test('rejects invalid project and session identifiers', () => {
  const fixture = storageFixture()
  assert.throws(() => fixture.storage.get('project', sessionId), /projet/)
  assert.throws(() => fixture.storage.save(projectId, 'session', document), /session/)
  fs.rmSync(fixture.root, { recursive: true, force: true })
})

test('ships the four teleprompter shortcuts in the shared preference defaults', () => {
  const shortcuts = defaults().shortcuts
  assert.equal(shortcuts['teleprompter.toggleVisibility'].keys, 'Alt+Shift+T')
  assert.equal(shortcuts['teleprompter.toggleAutoscroll'].keys, 'Alt+Shift+O')
  assert.equal(shortcuts['teleprompter.nextLine'].keys, 'Ctrl+Right')
  assert.equal(shortcuts['teleprompter.previousLine'].keys, 'Ctrl+Left')
})

test('limits native content protection checks to supported desktop platforms', () => {
  assert.equal(isContentProtectionSupported('win32'), true)
  assert.equal(isContentProtectionSupported('darwin'), true)
  assert.equal(isContentProtectionSupported('linux'), false)
})

test('clamps persisted teleprompter bounds to the active display', () => {
  assert.deepEqual(
    clampTeleprompterBounds({ x: -500, y: -200, width: 1600, height: 1200 }, { x: 0, y: 0, width: 1280, height: 720 }),
    { x: 0, y: 0, width: 1280, height: 720 },
  )
})
