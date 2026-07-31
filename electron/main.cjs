const { app, BrowserWindow, desktopCapturer, ipcMain, session, protocol, globalShortcut, screen, net } = require('electron')
const { autoUpdater } = require('electron-updater')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { Readable } = require('stream')
const { CaptureEngine } = require('./capture/capture-engine.cjs')
const { registerCaptureIpc } = require('./capture/capture-ipc.cjs')
const { registerProjectIpc } = require('./projects/project-ipc.cjs')
const { createProjectStore } = require('./projects/project-store.cjs')
const { WindowController } = require('./window/window-controller.cjs')
const { registerWindowIpc } = require('./window/window-ipc.cjs')
const { registerExportIpc } = require('./export/export-ipc.cjs')
const { createCameraOverlayWindow } = require('./camera/overlay-window.cjs')
const { createCountdownWindow } = require('./countdown-window.cjs')
const { createScreenRegionOverlayWindow } = require('./screen-region-overlay.cjs')
const { createCameraStorage, registerCameraIpc } = require('./camera-ipc.cjs')
const { createMicrophoneStorage, registerMicrophoneIpc } = require('./microphone/ipc.cjs')
const { createSystemAudioStorage, registerSystemAudioIpc } = require('./system-audio/ipc.cjs')
const { createWhisperModelStore } = require('./captions/whisper-model-store.cjs')
const { registerWhisperIpc } = require('./captions/whisper-ipc.cjs')
const { createPreferencesStore } = require('./preferences/preferences-store.cjs')
const { registerPreferencesIpc } = require('./preferences/preferences-ipc.cjs')
const { createUserPaths } = require('./storage/user-paths.cjs')
const { createBackgroundLibrary } = require('./backgrounds/background-library.cjs')
const { createAutoUpdater, registerUpdateIpc } = require('./updates/auto-updater.cjs')

// Set to true only while diagnosing Electron startup or renderer requests.
const ENABLE_ELECTRON_DIAGNOSTIC_LOGS = false

protocol.registerSchemesAsPrivileged([
  { scheme: 'whisper-model', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'project-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])

const startupAt = process.hrtime.bigint()
const logStartup = (step) => {
  if (!ENABLE_ELECTRON_DIAGNOSTIC_LOGS || app.isPackaged) return
  const elapsedMs = Number(process.hrtime.bigint() - startupAt) / 1_000_000
  console.log(`[electron +${elapsedMs.toFixed(0)} ms] ${step}`)
}

const applicationRoot = path.join(__dirname, '..')
const captureEngine = new CaptureEngine(app, applicationRoot)
const cameraStorage = createCameraStorage({})
const microphoneStorage = createMicrophoneStorage({})
const systemAudioStorage = createSystemAudioStorage({})
const controllers = new WeakMap()

function profileRendererRequests(webContents) {
  if (app.isPackaged) return
  const requests = new Map()
  const session = webContents.session
  session.webRequest.onBeforeRequest({ urls: ['http://localhost:6500/*'] }, (details, callback) => {
    requests.set(details.id, { startedAt: performance.now(), url: details.url })
    callback({})
  })
  session.webRequest.onCompleted({ urls: ['http://localhost:6500/*'] }, (details) => {
    const request = requests.get(details.id)
    if (!request) return
    requests.delete(details.id)
    const elapsedMs = performance.now() - request.startedAt
    if (elapsedMs >= 100) logStartup(`Renderer request ${details.statusCode} in ${elapsedMs.toFixed(0)} ms: ${request.url}`)
  })
  session.webRequest.onErrorOccurred({ urls: ['http://localhost:6500/*'] }, (details) => {
    const request = requests.get(details.id)
    requests.delete(details.id)
    logStartup(`Renderer request failed (${details.error}): ${request?.url || details.url}`)
  })
}

function isTrustedRenderer(url) {
  return url === 'http://localhost:6500/' || url.startsWith('http://localhost:6500/?') || url.startsWith('file://')
}

function configureMediaPermission() {
  const trusted = (webContents) => Boolean(webContents) && isTrustedRenderer(webContents.getURL())
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => trusted(webContents) && (permission === 'media' || permission === 'display-capture'))
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (!trusted(webContents)) return callback(false)
    callback(permission === 'media' || permission === 'display-capture')
  })
}

function configureDesktopLoopback() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      if (!app.isPackaged) logStartup(`Desktop loopback request received (${sources.length} screen source${sources.length === 1 ? '' : 's'}).`)
      callback(sources[0] ? { video: sources[0], audio: 'loopback' } : {})
    } catch {
      if (!app.isPackaged) logStartup('Desktop loopback source discovery failed.')
      callback({})
    }
  })
}

function createWindow(preferencesStore) {
  logStartup('Creating BrowserWindow.')
  const win = new BrowserWindow({
    width: 352, height: 512, frame: false, transparent: true, alwaysOnTop: false,
    icon: path.join(applicationRoot, 'public/brand/DemoRecorderIcon.ico'), resizable: true, maximizable: true, hasShadow: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: false, webSecurity: false },
  })
  const controller = new WindowController(win, { preferencesStore })
  controllers.set(win, controller)
  profileRendererRequests(win.webContents)
  win.once('ready-to-show', () => {
    logStartup('Window is ready to show (ready-to-show).')
    controller.markReadyToShow()
  })
  win.webContents.once('did-start-loading', () => logStartup('Renderer navigation started.'))
  win.webContents.once('dom-ready', () => logStartup('Renderer DOM is ready.'))
  win.webContents.once('did-finish-load', () => logStartup('Renderer loading finished.'))
  win.webContents.on('render-process-gone', (_event, details) => logStartup(`Renderer process exited (${details.reason}).`))
  if (!app.isPackaged) {
    win.webContents.once('did-finish-load', () => win.webContents.openDevTools({ mode: 'detach' }))
  }
  if (app.isPackaged) {
    logStartup('Loading dist/index.html.')
    win.loadFile(path.join(applicationRoot, 'dist/index.html'))
  } else {
    logStartup('Loading http://localhost:6500.')
    win.loadURL('http://localhost:6500')
  }
  return win
}

app.whenReady().then(() => {
  logStartup('Electron app.whenReady resolved.')
  configureMediaPermission()
  logStartup('Media permission policy registered.')
  configureDesktopLoopback()
  const userPaths = createUserPaths(app.getPath('videos'))
  const preferencesStore = createPreferencesStore(userPaths.preferences)
  const preferencesCleanup = registerPreferencesIpc({ ipcMain, BrowserWindow, globalShortcut, store: preferencesStore })
  app.once('will-quit', preferencesCleanup)
  logStartup('Desktop loopback policy registered.')
  registerCaptureIpc({ ipcMain, desktopCapturer, screen, captureEngine, app, userPaths, trackStorages: [cameraStorage, microphoneStorage, systemAudioStorage] })
  logStartup('Capture IPC registered.')
  registerCameraIpc({ ipcMain, storage: cameraStorage })
  logStartup('Camera IPC registered.')
  registerMicrophoneIpc({ ipcMain, storage: microphoneStorage })
  logStartup('Microphone IPC registered.')
  registerSystemAudioIpc({ ipcMain, storage: systemAudioStorage })
  logStartup('System audio IPC registered.')
  const projectStore = createProjectStore(userPaths.projects)
  registerProjectIpc(ipcMain, projectStore, createBackgroundLibrary(userPaths), require('electron').dialog, BrowserWindow)
  protocol.handle('project-media', async (request) => {
    try {
      const file = projectStore.mediaFileForUrl(request.url)
      if (!file || !fs.existsSync(file)) return new Response('Not found', { status: 404 })
      const response = await net.fetch(pathToFileURL(file).href)
      const ext = path.extname(file).toLowerCase()
      const mimeTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.mkv': 'video/x-matroska',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
      }
      const contentType = mimeTypes[ext] || 'application/octet-stream'
      const headers = new Headers(response.headers)
      headers.set('content-type', contentType)
      headers.set('access-control-allow-origin', '*')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    } catch (e) {
      console.error('[project-media] Error serving media:', e)
      return new Response('Internal error', { status: 500 })
    }
  })
  logStartup('Project IPC registered.')
  const whisperStore = createWhisperModelStore(userPaths.whisperModels)
  protocol.handle('whisper-model', (request) => {
    const file = whisperStore.fileForUrl(request.url)
    return file
      ? new Response(Readable.toWeb(fs.createReadStream(file)), { headers: { 'Content-Length': String(fs.statSync(file).size) } })
      : new Response('Not found', { status: 404 })
  })
  registerWhisperIpc({ ipcMain, store: whisperStore })
  logStartup('Whisper model IPC registered.')
  registerWindowIpc(ipcMain, (win) => win && controllers.get(win))
  const cameraOverlay = createCameraOverlayWindow({ applicationRoot, isPackaged: app.isPackaged })
  const countdownOverlay = createCountdownWindow({ applicationRoot, isPackaged: app.isPackaged })
  const screenRegionOverlay = createScreenRegionOverlayWindow({ applicationRoot, isPackaged: app.isPackaged })
  ipcMain.on('camera-overlay:configure', (_event, state) => cameraOverlay.configure(state))
  ipcMain.on('camera-overlay:set-active', (_event, active) => cameraOverlay.setActive(active))
  ipcMain.on('countdown:set', (_event, seconds) => countdownOverlay.show(Number.isInteger(seconds) && seconds >= 0 ? seconds : null))
  ipcMain.handle('screen-region:select', (_event, options) => screenRegionOverlay.select(options))
  ipcMain.on('screen-region:show', (_event, options) => screenRegionOverlay.show(options))
  ipcMain.on('screen-region:hide', () => screenRegionOverlay.hide())
  ipcMain.on('screen-region:confirm', (_event, region) => screenRegionOverlay.confirm(region))
  ipcMain.on('screen-region:cancel', () => screenRegionOverlay.cancel())
  ipcMain.handle('camera-overlay:state', () => cameraOverlay.state())
  logStartup('Window IPC registered.')
  const exportIpc = registerExportIpc({ ipcMain, dialog: require('electron').dialog, BrowserWindow })
  logStartup('Export IPC registered.')
  const updater = createAutoUpdater({ app, BrowserWindow, autoUpdater, openExternal: require('electron').shell.openExternal })
  registerUpdateIpc(ipcMain, updater)
  const win = createWindow(preferencesStore)
  void updater.checkForUpdates()
  win.webContents.once('destroyed', () => { cameraOverlay.destroy(); screenRegionOverlay.destroy(); exportIpc.cleanupWindow(win.webContents); cameraStorage.cleanupOwner(win.webContents.id); microphoneStorage.cleanupOwner(win.webContents.id); systemAudioStorage.cleanupOwner(win.webContents.id) })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(preferencesStore) })
})

let quitting = false
let captureShutdown = null
app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  captureShutdown ??= captureEngine.shutdown().finally(() => { quitting = true; app.quit() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
