const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { registerCaptureIpc } = require('../electron/capture/capture-ipc.cjs')

test('stops the native session and returns its completed video source', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-capture-ipc-'))
  const manifestPath = path.join(root, 'manifest.json')
  fs.mkdirSync(path.join(root, 'screen'))
  fs.writeFileSync(manifestPath, JSON.stringify({ projectId: 'project-1' }))
  fs.writeFileSync(path.join(root, 'screen', 'primary.mp4'), Buffer.from([1]))

  const handlers = new Map()
  const requests = []
  const session = { state: 'completed', sessionId: 'session-1', manifestPath }
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const captureEngine = {
    request: async (command) => {
      requests.push(command)
      return session
    },
  }
  registerCaptureIpc({
    ipcMain,
    desktopCapturer: {},
    screen: {},
    captureEngine,
    app: {},
    userPaths: { projects: root },
  })
  const request = handlers.get('capture:request')

  const stopped = await request({}, 'stop')
  assert.equal(stopped.projectId, 'project-1')
  assert.deepEqual(requests, ['stop'])
  assert.match(stopped.videoSrc, /primary\.mp4$/)
  fs.rmSync(root, { recursive: true, force: true })
})
