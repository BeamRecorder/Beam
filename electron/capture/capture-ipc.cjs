const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { buildDefaultCaptureConfig } = require('./capture-config.cjs')

const ALLOWED_COMMANDS = new Set(['discover', 'capabilities', 'permissions', 'formats', 'prepare', 'start', 'pause', 'resume', 'stop', 'status'])

function completedVideoSource(session) {
  if (!session?.manifestPath) return session
  const directory = path.dirname(session.manifestPath)
  const screenDirectory = path.join(directory, 'screen')
  const video = fs.existsSync(screenDirectory) ? fs.readdirSync(screenDirectory).filter((name) => /\.mp4$/i.test(name)).sort()[0] : null
  return video ? { ...session, videoSrc: pathToFileURL(path.join(screenDirectory, video)).href } : session
}

function registerCaptureIpc({ ipcMain, desktopCapturer, captureEngine, app, userPaths, trackStorages }) {
  const registerSession = (session) => { for (const storage of trackStorages) storage.registerSession(session); return session }
  const completeSession = (session) => trackStorages.reduce((value, storage) => storage.complete(value), session)
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
      return captureEngine.request('prepare', { config })
    }
    if (command === 'start-prepared-recording') return registerSession(await captureEngine.request('start'))
    if (command === 'start-recording') {
      await captureEngine.request('prepare', { config: payload.config })
      const session = await captureEngine.request('start')
      return registerSession(session)
    }
    if (command === 'stop') return completedVideoSource(completeSession(await captureEngine.request('stop')))
    if (!ALLOWED_COMMANDS.has(command)) throw new Error(`Commande de capture interdite: ${command}`)
    return captureEngine.request(command, payload)
  })
  ipcMain.handle('window:getSources', async (_event, types) => {
    const sources = await desktopCapturer.getSources({ types: types || ['window', 'screen'], thumbnailSize: { width: 300, height: 200 }, fetchWindowIcons: true })
    return sources.map((source) => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL(), appIcon: source.appIcon ? source.appIcon.toDataURL() : null }))
  })
}

module.exports = { registerCaptureIpc }
