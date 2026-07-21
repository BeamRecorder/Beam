const { app, BrowserWindow, desktopCapturer, ipcMain, session } = require('electron')
const path = require('path')
const { CaptureEngine } = require('./capture-engine.cjs')
const { registerCaptureIpc } = require('./capture-ipc.cjs')
const { registerProjectIpc } = require('./project-ipc.cjs')
const { createProjectStore } = require('./project-store.cjs')
const { WindowController } = require('./window-controller.cjs')
const { registerWindowIpc } = require('./window-ipc.cjs')
const { registerExportIpc } = require('./export-ipc.cjs')
const { createCameraStorage, registerCameraIpc } = require('./camera-ipc.cjs')
const { createMicrophoneStorage, registerMicrophoneIpc } = require('./microphone/ipc.cjs')
const { createSystemAudioStorage, registerSystemAudioIpc } = require('./system-audio/ipc.cjs')

const startupAt = process.hrtime.bigint()
const logStartup = (step) => {
  if (app.isPackaged) return
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
  const trusted = (webContents) => isTrustedRenderer(webContents.getURL())
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

function createWindow() {
  logStartup('Creating BrowserWindow.')
  const win = new BrowserWindow({
    width: 320, height: 480, frame: false, transparent: true, alwaysOnTop: false,
    icon: path.join(applicationRoot, 'public/brand/DemoRecorderIcon.ico'), resizable: true, maximizable: true, hasShadow: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: false, webSecurity: false },
  })
  const controller = new WindowController(win)
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
  if (!app.isPackaged && process.env.DEMO_RECORDER_DEVTOOLS === '1') {
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
  logStartup('Desktop loopback policy registered.')
  registerCaptureIpc({ ipcMain, desktopCapturer, captureEngine, app, trackStorages: [cameraStorage, microphoneStorage, systemAudioStorage] })
  logStartup('Capture IPC registered.')
  registerCameraIpc({ ipcMain, storage: cameraStorage })
  logStartup('Camera IPC registered.')
  registerMicrophoneIpc({ ipcMain, storage: microphoneStorage })
  logStartup('Microphone IPC registered.')
  registerSystemAudioIpc({ ipcMain, storage: systemAudioStorage })
  logStartup('System audio IPC registered.')
  registerProjectIpc(ipcMain, createProjectStore(path.join(app.getPath('videos'), 'DemoRecorder')))
  logStartup('Project IPC registered.')
  registerWindowIpc(ipcMain, (win) => win && controllers.get(win))
  logStartup('Window IPC registered.')
  const exportIpc = registerExportIpc({ ipcMain, dialog: require('electron').dialog, BrowserWindow })
  logStartup('Export IPC registered.')
  const win = createWindow()
  win.webContents.once('destroyed', () => { exportIpc.cleanupWindow(win.webContents); cameraStorage.cleanupOwner(win.webContents.id); microphoneStorage.cleanupOwner(win.webContents.id); systemAudioStorage.cleanupOwner(win.webContents.id) })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

let quitting = false
let captureShutdown = null
app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  captureShutdown ??= captureEngine.shutdown().finally(() => { quitting = true; app.quit() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
