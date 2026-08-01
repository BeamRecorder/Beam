const assert = require('node:assert/strict')
const test = require('node:test')

const { buildDefaultCaptureConfig } = require('../electron/capture/capture-config.cjs')

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
  ],
}

const environment = { platform: 'win32', defaultOutputRoot: 'recordings', excludedProcessId: 4242 }

test('builds a one-call recording config from defaults', () => {
  const config = buildDefaultCaptureConfig(catalog, {}, environment)
  assert.equal(config.screen.sourceId, 'display:1')
  assert.equal('microphone' in config, false)
  assert.equal('systemAudio' in config, false)
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
