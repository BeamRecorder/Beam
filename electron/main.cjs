const { app, BrowserWindow, desktopCapturer, ipcMain } = require('electron')
const path = require('path')
const { CaptureEngine } = require('./capture-engine.cjs')
const { registerCaptureIpc } = require('./capture-ipc.cjs')
const { registerProjectIpc } = require('./project-ipc.cjs')
const { createProjectStore } = require('./project-store.cjs')
const { WindowController } = require('./window-controller.cjs')
const { registerWindowIpc } = require('./window-ipc.cjs')
const { registerExportIpc } = require('./export-ipc.cjs')

const applicationRoot = path.join(__dirname, '..')
const captureEngine = new CaptureEngine(app, applicationRoot)
const controllers = new WeakMap()

function createWindow() {
  const win = new BrowserWindow({
    width: 320, height: 480, frame: false, transparent: true, alwaysOnTop: false,
    icon: path.join(applicationRoot, 'public/brand/DemoRecorderIcon.ico'), resizable: true, maximizable: true, hasShadow: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: false, webSecurity: false },
  })
  const controller = new WindowController(win)
  controllers.set(win, controller)
  win.once('ready-to-show', () => controller.markReadyToShow())
  if (!app.isPackaged) {
    win.webContents.once('did-finish-load', () => win.webContents.openDevTools({ mode: 'detach' }))
  }
  if (app.isPackaged) win.loadFile(path.join(applicationRoot, 'dist/index.html'))
  else win.loadURL('http://localhost:6500')
  return win
}

app.whenReady().then(() => {
  registerCaptureIpc({ ipcMain, desktopCapturer, captureEngine, app })
  registerProjectIpc(ipcMain, createProjectStore(path.join(app.getPath('videos'), 'DemoRecorder')))
  registerWindowIpc(ipcMain, (win) => win && controllers.get(win))
  const exportIpc = registerExportIpc({ ipcMain, dialog: require('electron').dialog, BrowserWindow })
  const win = createWindow()
  win.webContents.once('destroyed', () => exportIpc.cleanupWindow(win.webContents))
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
