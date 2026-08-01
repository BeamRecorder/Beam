const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { createSystemAudioStorage } = require('../electron/system-audio/ipc.cjs')

const sessionId = '019f84dd-4d9d-7f61-ac30-5da50169ecbc'
const sourceId = 'system-audio:chromium:desktop-loopback'
const format = { codec: 'opus', sampleRate: 48_000, channels: 2 }

function sessionFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-system-audio-'))
  const manifestPath = path.join(directory, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify({ selectedSources: { systemAudio: null }, permissions: { systemAudio: null }, tracks: [], warnings: [] }))
  return { directory, manifestPath, sessionId }
}

test('stores Chromium loopback WebM beside the session with its negotiated audio format', () => {
  const storage = createSystemAudioStorage({})
  const session = sessionFixture()
  storage.registerSession(session)
  const opened = storage.begin(31, { sessionId, sourceId, format, startNs: 0 })
  storage.write(31, { jobId: opened.jobId, sequence: 0, data: new Uint8Array([9, 8, 7]) })
  storage.finalize(31, { jobId: opened.jobId, endNs: 1_000_000, metrics: { samplesReceived: 1 } })
  storage.complete(session)
  const manifest = JSON.parse(fs.readFileSync(session.manifestPath, 'utf8'))
  assert.equal(manifest.selectedSources.systemAudio, sourceId)
  assert.deepEqual(manifest.tracks[0].format, { mediaType: 'audio', sampleFormat: 'opus', sampleRate: 48_000, channels: 2 })
  assert.equal(manifest.tracks[0].segments[0].path, 'system-audio/segment-0001.webm')
  assert.deepEqual(fs.readFileSync(path.join(session.directory, 'system-audio', 'segment-0001.webm')), Buffer.from([9, 8, 7]))
})

test('records a loopback permission failure as an explicit failed optional track', () => {
  const storage = createSystemAudioStorage({})
  const session = sessionFixture()
  storage.registerSession(session)
  storage.fail(32, { sessionId, sourceId, reason: 'Audio sharing was not granted' })
  storage.complete(session)
  const track = JSON.parse(fs.readFileSync(session.manifestPath, 'utf8')).tracks[0]
  assert.equal(track.kind, 'system-audio')
  assert.equal(track.status, 'failed')
  assert.deepEqual(track.format, { mediaType: 'audio', sampleFormat: 'opus', sampleRate: 0, channels: 0 })
})

test('rejects non-loopback sources, malformed formats, and cross-renderer finalization', () => {
  const storage = createSystemAudioStorage({})
  const session = sessionFixture()
  storage.registerSession(session)
  assert.throws(() => storage.begin(33, { sessionId, sourceId: 'system-audio:wasapi:default', format, startNs: 0 }), /Invalid Chromium system-audio source/)
  assert.throws(() => storage.begin(33, { sessionId, sourceId, format: { codec: 'aac', sampleRate: 48_000, channels: 2 }, startNs: 0 }), /Invalid system audio format/)
  const opened = storage.begin(33, { sessionId, sourceId, format, startNs: 0 })
  assert.throws(() => storage.finalize(34, { jobId: opened.jobId, endNs: 1, metrics: {} }), /not authorized/)
  storage.forgetSession(sessionId)
})
