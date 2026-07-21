const assert = require('node:assert/strict')
const test = require('node:test')

const { buildDefaultCaptureConfig } = require('../electron/capture-config.cjs')

const catalog = {
  capabilities: {
    systemAudio: true,
    separateCursor: true,
    cursorClicks: true,
    cursorShapes: false,
  },
  sources: [
    { id: 'display:2', kind: 'display', isDefault: false },
    { id: 'display:1', kind: 'display', isDefault: true },
    { id: 'window:1', kind: 'window', isDefault: false },
    { id: 'mic:1', kind: 'microphone', isDefault: true },
    { id: 'camera:1', kind: 'camera', isDefault: true },
  ],
}

const environment = { platform: 'win32', defaultOutputRoot: 'recordings' }

test('builds a one-call recording config from defaults', () => {
  const config = buildDefaultCaptureConfig(catalog, { systemAudio: true }, environment)
  assert.equal(config.screen.sourceId, 'display:1')
  assert.equal(config.microphone.sourceId, 'mic:1')
  assert.equal(config.camera.sourceId, 'camera:1')
  assert.deepEqual(config.systemAudio, { mode: 'default-mix' })
  assert.deepEqual(config.cursor, {
    mode: 'separate',
    captureClicks: true,
    captureShape: false,
  })
  assert.equal(config.recording.outputRoot, 'recordings')
})

test('supports explicit source selection and disabling optional devices', () => {
  const config = buildDefaultCaptureConfig(catalog, {
    screenKind: 'window',
    screenId: 'window:1',
    microphoneId: null,
    cameraId: null,
  }, environment)
  assert.equal(config.screen.sourceId, 'window:1')
  assert.equal(config.microphone, null)
  assert.equal(config.camera, null)
})

test('rejects missing explicit sources and invalid queue capacity', () => {
  assert.throws(
    () => buildDefaultCaptureConfig(catalog, { screenId: 'missing' }, environment),
    /Source display introuvable/,
  )
  assert.throws(
    () => buildDefaultCaptureConfig(catalog, { queueCapacity: 0 }, environment),
    /queueCapacity/,
  )
})
