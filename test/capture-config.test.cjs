const assert = require('node:assert/strict')
const test = require('node:test')

const { buildDefaultCaptureConfig } = require('../electron/capture/capture-config.cjs')

const catalog = {
  capabilities: {
    systemAudioCapture: true,
    separateCursor: true,
    cursorClicks: true,
    cursorShapes: false,
  },
  sources: [
    { id: 'display:2', kind: 'display', isDefault: false },
    { id: 'display:1', kind: 'display', isDefault: true },
    { id: 'window:1', kind: 'window', isDefault: false },
    { id: 'wgc:window:7b', kind: 'window', isDefault: false },
    { id: 'sck:window:123', kind: 'window', isDefault: false },
    { id: 'camera:nokhwa:0', kind: 'camera', isDefault: true },
    { id: 'microphone:cpal:default', kind: 'microphone', isDefault: true },
    { id: 'system-audio:cpal:default', kind: 'system-audio', isDefault: true },
  ],
}

const environment = { platform: 'win32', defaultOutputRoot: 'recordings', excludedProcessId: 4242 }

test('builds a one-call recording config from defaults', () => {
  const config = buildDefaultCaptureConfig(catalog, {}, environment)

  assert.equal(config.screen.sourceId, 'display:1')
  assert.equal(config.camera, null)
  assert.equal(config.microphone, null)
  assert.equal(config.systemAudio, null)
  assert.deepEqual(config.cursor, {
    mode: 'separate',
    captureClicks: true,
    captureShape: false,
  })
  assert.equal(config.recording.outputRoot, 'recordings')
  assert.equal(config.excludedProcessId, 4242)
})

test('supports explicit source selection and disabling optional devices', () => {
  const config = buildDefaultCaptureConfig(catalog, {
    screenKind: 'window',
    screenId: 'window:1',
  }, environment)
  assert.equal(config.screen.sourceId, 'window:1')
})

test('normalizes an Electron Windows window id to the Rust WGC source id', () => {
  const config = buildDefaultCaptureConfig(catalog, {
    screenKind: 'window',
    screenId: 'window:123:0',
  }, environment)
  assert.equal(config.screen.sourceId, 'wgc:window:7b')
})

test('normalizes an Electron macOS window id to the ScreenCaptureKit source id', () => {
  const config = buildDefaultCaptureConfig(catalog, {
    screenKind: 'window',
    screenId: 'window:123:0',
  }, { ...environment, platform: 'darwin' })
  assert.equal(config.screen.sourceId, 'sck:window:123')
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
