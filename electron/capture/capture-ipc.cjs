const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { buildDefaultCaptureConfig } = require('./capture-config.cjs')

const ALLOWED_COMMANDS = new Set(['discover', 'capabilities', 'permissions', 'formats', 'prepare', 'start', 'pause', 'resume', 'stop', 'status', 'preview-start', 'preview-stop'])

function completedVideoSource(session) {
  if (!session?.manifestPath) return session
  const directory = path.dirname(session.manifestPath)
  const screenDirectory = path.join(directory, 'screen')
  const video = fs.existsSync(screenDirectory) ? fs.readdirSync(screenDirectory).filter((name) => /\.mp4$/i.test(name)).sort()[0] : null
  return video ? { ...session, videoSrc: pathToFileURL(path.join(screenDirectory, video)).href } : session
}

function withProjectId(session) {
  if (!session || typeof session !== 'object' || typeof session.manifestPath !== 'string') return session
  try {
    const manifest = JSON.parse(fs.readFileSync(session.manifestPath, 'utf8'))
    return typeof manifest.projectId === 'string' ? { ...session, projectId: manifest.projectId } : session
  } catch {
    return session
  }
}

function registerCaptureIpc({ ipcMain, desktopCapturer, screen, captureEngine, app, userPaths }) {
  const registerSession = (session) => withProjectId(session)
  ipcMain.handle('capture:request', async (_event, command, payload = {}) => {
    if (command === 'start-default-recording') {
      const catalog = await captureEngine.request('discover')
      const config = buildDefaultCaptureConfig(catalog, payload.options || {}, { platform: process.platform, defaultOutputRoot: userPaths.projects, excludedProcessId: process.pid })
      await captureEngine.request('prepare', { config })
      const session = await captureEngine.request('start')
      return registerSession(session)
    }
    if (command === 'prepare-default-recording') {
      const catalog = await captureEngine.request('discover')
      const config = buildDefaultCaptureConfig(catalog, payload.options || {}, { platform: process.platform, defaultOutputRoot: userPaths.projects, excludedProcessId: process.pid })
      return withProjectId(await captureEngine.request('prepare', { config }))
    }
    if (command === 'start-prepared-recording') return registerSession(await captureEngine.request('start'))
    if (command === 'cancel-prepared-recording') {
      await captureEngine.request('cancel')
      return undefined
    }
    if (command === 'discard-recording') {
      const session = await captureEngine.request('discard')
      return undefined
    }
    if (command === 'start-recording') {
      await captureEngine.request('prepare', { config: payload.config })
      const session = await captureEngine.request('start')
      return registerSession(session)
    }
    if (command === 'camera-preview-start') return captureEngine.request('preview-start', { source: payload.cameraId })
    if (command === 'camera-preview-stop') return captureEngine.request('preview-stop')
    if (command === 'stop') return withProjectId(completedVideoSource(await captureEngine.request('stop')))
    if (!ALLOWED_COMMANDS.has(command)) throw new Error(`Commande de capture interdite: ${command}`)
    return withProjectId(await captureEngine.request(command, payload))
  })
  ipcMain.handle('window:getSources', async (_event, types) => {
    const sources = await desktopCapturer.getSources({ types: types || ['window', 'screen'], thumbnailSize: { width: 300, height: 200 }, fetchWindowIcons: true })
    return sources.map((source) => {
      const display = source.display_id ? screen.getAllDisplays().find((item) => String(item.id) === String(source.display_id)) : null
      return { id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL(), appIcon: source.appIcon ? source.appIcon.toDataURL() : null, displayId: source.display_id || undefined, displayBounds: display?.bounds }
    })
  })
}

module.exports = { registerCaptureIpc }
