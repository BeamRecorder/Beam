const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { createCameraStorage } = require('../electron/camera-ipc.cjs')

const sessionId = '019f84dd-4d9d-7f61-ac30-5da50169ecbc'
const sourceId = 'camera:chromium:device-1'
const format = { codec: 'vp8', width: 1920, height: 1080, nominalFps: 30 }

function sessionFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-recorder-camera-'))
  const manifestPath = path.join(directory, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify({ selectedSources: { screen: 'display:1', camera: null }, permissions: { camera: null }, tracks: [], warnings: [] }))
  return { directory, manifestPath, sessionId }
}

test('finalizes ordered WebM chunks beside the native session and merges the camera track', () => {
  const storage = createCameraStorage({})
  const session = sessionFixture()
  storage.registerSession(session)
  const opened = storage.begin(11, { sessionId, sourceId, format, startNs: 0 })
  storage.write(11, { jobId: opened.jobId, sequence: 0, data: new Uint8Array([1, 2, 3]) })
  storage.finalize(11, { jobId: opened.jobId, endNs: 1_000_000_000, metrics: { framesAcquired: 30, framesReceived: 30 } })
  storage.complete(session)
  const manifest = JSON.parse(fs.readFileSync(session.manifestPath, 'utf8'))
  assert.equal(manifest.selectedSources.camera, sourceId)
  assert.equal(manifest.permissions.camera, 'granted')
  assert.deepEqual(manifest.tracks[0].format, { mediaType: 'video', ...format })
  assert.equal(manifest.tracks[0].segments[0].path, 'camera/segment-0001.webm')
  assert.deepEqual(fs.readFileSync(path.join(session.directory, 'camera', 'segment-0001.webm')), Buffer.from([1, 2, 3]))
})

test('rejects out-of-order chunks and removes aborted partial files', () => {
  const storage = createCameraStorage({})
  const session = sessionFixture()
  storage.registerSession(session)
  const opened = storage.begin(12, { sessionId, sourceId, format, startNs: 0 })
  assert.throws(() => storage.write(12, { jobId: opened.jobId, sequence: 1, data: new Uint8Array([1]) }), /sequence/)
  storage.forgetSession(sessionId)
  assert.equal(fs.existsSync(path.join(session.directory, 'camera', 'segment-0001.webm')), false)
  assert.equal(fs.readdirSync(path.join(session.directory, 'camera')).length, 0)
})

test('persists an explicit camera failure without fabricating a media segment', () => {
  const storage = createCameraStorage({})
  const session = sessionFixture()
  storage.registerSession(session)
  storage.begin(13, { sessionId, sourceId, format, startNs: 0 })
  storage.fail(13, { sessionId, reason: 'Camera disconnected' })
  storage.complete(session)
  const manifest = JSON.parse(fs.readFileSync(session.manifestPath, 'utf8'))
  assert.equal(manifest.tracks[0].status, 'failed')
  assert.equal(manifest.tracks[0].terminationReason, 'Camera disconnected')
  assert.deepEqual(manifest.tracks[0].segments, [])
  assert.match(manifest.warnings[0], /Camera recording failed/)
})
