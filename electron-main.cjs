const { app, BrowserWindow, ipcMain } = require('electron')
const { spawn } = require('child_process')
const { randomUUID } = require('crypto')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

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
    setTimeout(() => {
      if (this.process === child && !child.killed) child.kill()
    }, 2_000).unref()
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
  if (command === 'start-recording') {
    await captureEngine.request('prepare', { config: payload.config })
    return captureEngine.request('start')
  }
  if (!allowedCommands.has(command)) throw new Error(`Commande de capture interdite: ${command}`)
  return captureEngine.request(command, payload)
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  if (app.isPackaged) win.loadFile(path.join(__dirname, 'dist/index.html'))
  else win.loadURL('http://localhost:6500')
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  void captureEngine.shutdown()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
