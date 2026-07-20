const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron')
const { spawn } = require('child_process')
const { randomUUID } = require('crypto')
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { buildDefaultCaptureConfig } = require('./capture-config.cjs')

const CAPTURE_CHANNEL = 'capture:request'
const REQUEST_TIMEOUT_MS = 30_000

class CaptureEngine {
  constructor() {
    this.process = null
    this.pending = new Map()
    this.stderr = []
  }

  resolveExecutable() {
    const filename = process.platform === 'win32' ? 'capture-engine.exe' : 'capture-engine'
    const candidates = [
      process.env.DEMO_RECORDER_CAPTURE_ENGINE,
      app.isPackaged && path.join(process.resourcesPath, 'capture-engine', filename),
      path.join(__dirname, 'target', 'release', filename),
      path.join(__dirname, 'target', 'debug', filename),
    ].filter(Boolean)
    const executable = candidates.find((candidate) => fs.existsSync(candidate))
    if (!executable) {
      throw new Error(
        `capture-engine introuvable. Exécutez "cargo build -p capture --bin capture-engine" ` +
          `ou définissez DEMO_RECORDER_CAPTURE_ENGINE. Chemins testés: ${candidates.join(', ')}`,
      )
    }
    return executable
  }

  ensureStarted() {
    if (this.process && !this.process.killed) return
    const executable = this.resolveExecutable()
    const child = spawn(executable, [], {
      cwd: app.getPath('userData'),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.process = child
    this.stderr = []

    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let response
      try {
        response = JSON.parse(line)
      } catch (error) {
        this.failAll(new Error(`Réponse invalide de capture-engine: ${error.message}`))
        return
      }
      const pending = this.pending.get(response.requestId)
      if (!pending) return
      clearTimeout(pending.timeout)
      this.pending.delete(response.requestId)
      if (response.ok) pending.resolve(response.result)
      else {
        const engineError = new Error(response.error?.message || 'Erreur de capture inconnue')
        engineError.code = response.error?.code || 'capture-error'
        pending.reject(engineError)
      }
    })
    readline.createInterface({ input: child.stderr }).on('line', (line) => {
      this.stderr.push(line)
      if (this.stderr.length > 20) this.stderr.shift()
    })
    child.once('error', (error) => this.failAll(error))
    child.once('exit', (code, signal) => {
      const details = this.stderr.length ? `\n${this.stderr.join('\n')}` : ''
      this.failAll(new Error(`capture-engine arrêté (code=${code}, signal=${signal}).${details}`))
      if (this.process === child) this.process = null
    })
  }

  request(command, payload = {}) {
    this.ensureStarted()
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Délai dépassé pour la commande de capture "${command}"`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timeout })
      this.process.stdin.write(`${JSON.stringify({ id, command, ...payload })}\n`, (error) => {
        if (!error) return
        clearTimeout(timeout)
        this.pending.delete(id)
        reject(error)
      })
    })
  }

  failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }

  async shutdown() {
    const child = this.process
    if (!child) return
    try {
      await this.request('status')
      await this.request('stop')
    } catch {
      // An idle or already failed session has nothing to finalize.
    }
    child.stdin.end()
    await new Promise((resolve) => {
      if (child.exitCode !== null) {
        resolve()
        return
      }
      const timeout = setTimeout(() => {
        if (this.process === child && !child.killed) child.kill()
        resolve()
      }, 2_000)
      child.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }
}

const captureEngine = new CaptureEngine()
const allowedCommands = new Set([
  'discover',
  'capabilities',
  'permissions',
  'formats',
  'prepare',
  'start',
  'pause',
  'resume',
  'stop',
  'status',
])

ipcMain.handle(CAPTURE_CHANNEL, async (_event, command, payload) => {
  if (command === 'start-default-recording') {
    const options = payload?.options || {}
    const catalog = await captureEngine.request('discover')
    const config = buildDefaultCaptureConfig(catalog, options, {
      platform: process.platform,
      defaultOutputRoot: path.join(app.getPath('videos'), 'DemoRecorder'),
    })
    await captureEngine.request('prepare', { config })
    return captureEngine.request('start')
  }
  if (command === 'start-recording') {
    await captureEngine.request('prepare', { config: payload.config })
    return captureEngine.request('start')
  }
  if (!allowedCommands.has(command)) throw new Error(`Commande de capture interdite: ${command}`)
  return captureEngine.request(command, payload)
})

ipcMain.handle('window:getSources', async (_event, types) => {
  const sources = await desktopCapturer.getSources({
    types: types || ['window', 'screen'],
    thumbnailSize: { width: 300, height: 200 },
    fetchWindowIcons: true,
  })
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
    appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
  }))
})

ipcMain.on('window:close', (event) => {
  const webContents = event.sender
  const win = BrowserWindow.fromWebContents(webContents)
  if (win) win.close()
})

ipcMain.on('window:minimize', (event) => {
  const webContents = event.sender
  const win = BrowserWindow.fromWebContents(webContents)
  if (win) win.minimize()
})

ipcMain.on('window:setPosition', (event, x, y) => {
  const webContents = event.sender
  const win = BrowserWindow.fromWebContents(webContents)
  if (win) {
    win.setPosition(Math.round(x), Math.round(y))
  }
})

ipcMain.on('window:setSize', (event, width, height) => {
  const webContents = event.sender
  const win = BrowserWindow.fromWebContents(webContents)
  if (win) {
    win.setSize(Math.round(width), Math.round(height))
  }
})

let dragStartMouse = null
let dragStartWin = null

ipcMain.on('window:dragStart', (event) => {
  const webContents = event.sender
  const win = BrowserWindow.fromWebContents(webContents)
  if (win) {
    const { screen } = require('electron')
    dragStartMouse = screen.getCursorScreenPoint()
    dragStartWin = win.getPosition()
  }
})

ipcMain.on('window:drag', (event) => {
  const webContents = event.sender
  const win = BrowserWindow.fromWebContents(webContents)
  if (win && dragStartMouse && dragStartWin) {
    const { screen } = require('electron')
    const currentMouse = screen.getCursorScreenPoint()
    const dx = currentMouse.x - dragStartMouse.x
    const dy = currentMouse.y - dragStartMouse.y
    win.setPosition(Math.round(dragStartWin[0] + dx), Math.round(dragStartWin[1] + dy))
  }
})

function createWindow() {
  const win = new BrowserWindow({
    width: 320,
    height: 480,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  if (app.isPackaged) win.loadFile(path.join(__dirname, 'dist/index.html'))
  else {
    win.loadURL('http://localhost:6500')
    win.webContents.openDevTools({ mode: 'detach' }) // Open DevTools detached
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

let quitAfterCaptureShutdown = false
let captureShutdown = null

app.on('before-quit', (event) => {
  if (quitAfterCaptureShutdown) return
  event.preventDefault()
  captureShutdown ??= captureEngine.shutdown().finally(() => {
    quitAfterCaptureShutdown = true
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
