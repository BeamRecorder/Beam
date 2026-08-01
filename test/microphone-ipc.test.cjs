const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { createMicrophoneStorage } = require('../electron/microphone/ipc.cjs')

const sessionId = '019f84dd-4d9d-7f61-ac30-5da50169ecbc'
const sourceId = 'microphone:chromium:device-1'
const format = { codec: 'opus', sampleRate: 48_000, channels: 2 }

function sessionFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-microphone-'))
  const manifestPath = path.join(directory, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify({ selectedSources: { screen: 'display:1', microphone: null }, permissions: { microphone: null }, tracks: [], warnings: [] }))
  return { directory, manifestPath, sessionId }
}

test('finalizes ordered Opus WebM chunks and merges a completed microphone track', () => {
  const storage = createMicrophoneStorage({})
  const session = sessionFixture()
  storage.registerSession(session)
  const opened = storage.begin(21, { sessionId, sourceId, format, startNs: 100 })
  storage.write(21, { jobId: opened.jobId, sequence: 0, data: new Uint8Array([1, 2]) })
  storage.write(21, { jobId: opened.jobId, sequence: 1, data: new Uint8Array([3, 4]) })
  storage.finalize(21, { jobId: opened.jobId, endNs: 200, metrics: { samplesReceived: 2 } })
  storage.complete(session)
  const manifest = JSON.parse(fs.readFileSync(session.manifestPath, 'utf8'))
  assert.equal(manifest.selectedSources.microphone, sourceId)
  assert.equal(manifest.permissions.microphone, 'granted')
  assert.deepEqual(manifest.tracks[0].format, { mediaType: 'audio', sampleFormat: 'opus', sampleRate: 48_000, channels: 2 })
  assert.deepEqual(manifest.tracks[0].segments[0], { ...manifest.tracks[0].segments[0], path: 'microphone/segment-0001.webm', startNs: 100, endNs: 200, complete: true })
  assert.deepEqual(fs.readFileSync(path.join(session.directory, 'microphone', 'segment-0001.webm')), Buffer.from([1, 2, 3, 4]))
})

test('persists a denied microphone without inventing samples or device settings', () => {
  const storage = createMicrophoneStorage({})
  const session = sessionFixture()
  storage.registerSession(session)
  storage.fail(22, { sessionId, sourceId, reason: 'Permission denied' })
  storage.complete(session)
  const manifest = JSON.parse(fs.readFileSync(session.manifestPath, 'utf8'))
  assert.equal(manifest.tracks[0].status, 'failed')
  assert.equal(manifest.tracks[0].terminationReason, 'Permission denied')
  assert.deepEqual(manifest.tracks[0].format, { mediaType: 'audio', sampleFormat: 'opus', sampleRate: 0, channels: 0 })
  assert.deepEqual(manifest.tracks[0].segments, [])
  assert.match(manifest.warnings[0], /Microphone recording failed/)
})

test('rejects malformed sources, cross-renderer writes, invalid formats and out-of-order chunks', () => {
  const storage = createMicrophoneStorage({})
  const session = sessionFixture()
  storage.registerSession(session)
  assert.throws(() => storage.begin(23, { sessionId, sourceId: 'microphone:1', format, startNs: 0 }), /Invalid Chromium microphone source/)
  assert.throws(() => storage.begin(23, { sessionId, sourceId, format: { ...format, codec: 'aac' }, startNs: 0 }), /Invalid microphone format/)
  const opened = storage.begin(23, { sessionId, sourceId, format, startNs: 0 })
  assert.throws(() => storage.write(24, { jobId: opened.jobId, sequence: 0, data: new Uint8Array([1]) }), /not authorized/)
  assert.throws(() => storage.write(23, { jobId: opened.jobId, sequence: 1, data: new Uint8Array([1]) }), /sequence/)
  assert.throws(() => storage.finalize(23, { jobId: opened.jobId, endNs: -1, metrics: {} }), /non-negative integer/)
  storage.forgetSession(sessionId)
  assert.equal(fs.readdirSync(path.join(session.directory, 'microphone')).length, 0)
})
