const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { registerCaptureIpc } = require('../electron/capture/capture-ipc.cjs')

test('stops native capture before completing sidecar tracks', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-capture-ipc-'))
  const manifestPath = path.join(root, 'manifest.json')
  fs.mkdirSync(path.join(root, 'screen'))
  fs.writeFileSync(manifestPath, JSON.stringify({ projectId: 'project-1' }))
  fs.writeFileSync(path.join(root, 'screen', 'primary.mp4'), Buffer.from([1]))

  const handlers = new Map()
  const requests = []
  let completeCalls = 0
  const session = { state: 'completed', sessionId: 'session-1', manifestPath }
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const captureEngine = {
    request: async (command) => {
      requests.push(command)
      return session
    },
  }
  const storage = {
    registerSession: () => undefined,
    complete: (value) => { completeCalls += 1; return value },
  }

  registerCaptureIpc({
    ipcMain,
    desktopCapturer: {},
    screen: {},
    captureEngine,
    app: {},
    userPaths: { projects: root },
    trackStorages: [storage],
  })
  const request = handlers.get('capture:request')

  const stopped = await request({}, 'stop-native-recording')
  assert.equal(stopped.projectId, 'project-1')
  assert.deepEqual(requests, ['stop'])
  assert.equal(completeCalls, 0)

  const completed = await request({}, 'complete-native-recording')
  assert.equal(completeCalls, 1)
  assert.match(completed.videoSrc, /primary\.mp4$/)
  fs.rmSync(root, { recursive: true, force: true })
})
