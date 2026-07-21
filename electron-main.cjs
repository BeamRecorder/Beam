const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron')
const { spawn } = require('child_process')
const { randomUUID } = require('crypto')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
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
  if (command === 'stop') {
    const session = await captureEngine.request('stop')
    if (session && session.manifestPath) {
      const sessionDirectory = path.dirname(session.manifestPath)
      const video = fs.existsSync(path.join(sessionDirectory, 'screen'))
        ? fs.readdirSync(path.join(sessionDirectory, 'screen'))
            .filter((filename) => /\.mp4$/i.test(filename))
            .sort()[0]
        : null
      if (video) session.videoSrc = pathToFileURL(path.join(sessionDirectory, 'screen', video)).href
    }
    return session
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

function safeProjectPath(projectDirectory, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath) return null
  const root = path.resolve(projectDirectory)
  const candidate = path.resolve(root, relativePath)
  return candidate === root || candidate.startsWith(`${root}${path.sep}`) ? candidate : null
}

function findProjectPreview(projectDirectory, sessions) {
  for (const session of [...sessions].reverse()) {
    const sessionDirectory = safeProjectPath(projectDirectory, session.relativePath)
    if (!sessionDirectory || !fs.existsSync(sessionDirectory)) continue
    const screenDirectory = path.join(sessionDirectory, 'screen')
    if (!fs.existsSync(screenDirectory)) continue
    const video = fs.readdirSync(screenDirectory)
      .filter((filename) => /\.mp4$/i.test(filename))
      .sort()[0]
    if (video) return pathToFileURL(path.join(screenDirectory, video)).href
  }
  return null
}

function readCursorEvents(cursorPath) {
  if (!fs.existsSync(cursorPath)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(cursorPath, 'utf8'))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    // Keep old/incomplete recordings usable when the finalized JSON is still JSONL.
    return fs.readFileSync(cursorPath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try { return [JSON.parse(line)] } catch { return [] }
      })
  }
}

function readCursorTelemetry(telemetryPath) {
  if (!fs.existsSync(telemetryPath)) return []
  try {
    const payload = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'))
    const samples = Array.isArray(payload?.samples) ? payload.samples : []
    return samples.filter((sample) => sample && isFiniteNumber(sample.timeMs) && isFiniteNumber(sample.cx) && isFiniteNumber(sample.cy))
      .map((sample) => ({
        timeMs: Math.max(0, sample.timeMs),
        cx: Math.max(0, Math.min(1, sample.cx)),
        cy: Math.max(0, Math.min(1, sample.cy)),
        interactionType: ['move', 'click', 'double-click', 'right-click', 'middle-click', 'mouseup'].includes(sample.interactionType) ? sample.interactionType : undefined,
        cursorType: typeof sample.cursorType === 'string' ? sample.cursorType : undefined,
      }))
      .sort((left, right) => left.timeMs - right.timeMs)
  } catch { return [] }
}

function emptyZoomState() {
  return { elements: [], generatedSessions: [] }
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateZoomState(value) {
  if (!value || !Array.isArray(value.elements) || !Array.isArray(value.generatedSessions)) {
    throw new Error('État des zooms invalide')
  }
  const ids = new Set()
  const elements = value.elements.map((element) => {
    if (!element || typeof element.id !== 'string' || !element.id || ids.has(element.id)) {
      throw new Error('Identifiant de zoom invalide')
    }
    ids.add(element.id)
    const legacy = isFiniteNumber(element.scale) && ['automatic', 'manual'].includes(element.source)
    const depthForLegacyScale = (scale) => [1.25, 1.5, 1.8, 2.2, 3.5, 5].reduce((best, candidate, index) =>
      Math.abs(candidate - scale) < Math.abs([1.25, 1.5, 1.8, 2.2, 3.5, 5][best - 1] - scale) ? index + 1 : best, 1)
    if (
      typeof element.sessionId !== 'string' ||
      !isFiniteNumber(element.startMs) || !isFiniteNumber(element.endMs) ||
      element.endMs <= element.startMs ||
      !element.focus || !isFiniteNumber(element.focus.cx) || !isFiniteNumber(element.focus.cy) ||
      element.focus.cx < 0 || element.focus.cx > 1 || element.focus.cy < 0 || element.focus.cy > 1 ||
      !(legacy || ([1, 2, 3, 4, 5, 6].includes(element.depth) && ['auto', 'manual'].includes(element.mode)))
    ) throw new Error('Propriétés de zoom invalides')
    return {
      id: element.id,
      sessionId: element.sessionId,
      startMs: Math.round(element.startMs),
      endMs: Math.round(element.endMs),
      focus: { cx: element.focus.cx, cy: element.focus.cy },
      depth: legacy ? depthForLegacyScale(element.scale) : element.depth,
      mode: legacy ? (element.source === 'automatic' ? 'auto' : 'manual') : element.mode,
    }
  })
  const generatedSessions = value.generatedSessions.map((record) => {
    if (!record || typeof record.sessionId !== 'string' || !record.sessionId || !Number.isInteger(record.algorithmVersion) || typeof record.generatedAt !== 'string') {
      throw new Error('Métadonnées de génération invalides')
    }
    return { sessionId: record.sessionId, algorithmVersion: record.algorithmVersion, generatedAt: record.generatedAt }
  })
  return { elements, generatedSessions }
}

function writeProjectManifest(projectDirectoryPath, manifest) {
  const target = path.join(projectDirectoryPath, 'project.json')
  const temporary = `${target}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  fs.renameSync(temporary, target)
}

function readProjectEditorData(projectId) {
  const directory = projectDirectory(projectId)
  const manifest = readProjectManifest(directory)
  const sessions = Array.isArray(manifest.sessions) ? manifest.sessions : []

  for (const session of [...sessions].reverse()) {
    const sessionDirectory = safeProjectPath(directory, session.relativePath)
    if (!sessionDirectory || !fs.existsSync(sessionDirectory)) continue

    const sessionManifestPath = [
      path.join(sessionDirectory, 'manifest.json'),
      path.join(sessionDirectory, 'manifest.partial.json'),
    ].find((candidate) => fs.existsSync(candidate))
    if (!sessionManifestPath) continue

    let sessionManifest
    try {
      sessionManifest = JSON.parse(fs.readFileSync(sessionManifestPath, 'utf8'))
    } catch {
      continue
    }

    const screenDirectory = path.join(sessionDirectory, 'screen')
    const video = fs.existsSync(screenDirectory)
      ? fs.readdirSync(screenDirectory).filter((filename) => /\.mp4$/i.test(filename)).sort()[0]
      : null

    const tracks = Array.isArray(sessionManifest.tracks)
      ? sessionManifest.tracks.map((track) => ({
          ...track,
          assets: Array.isArray(track.segments)
            ? track.segments.map((segment) => {
                const assetPath = safeProjectPath(sessionDirectory, segment.path)
                const exists = Boolean(assetPath && fs.existsSync(assetPath))
                return {
                  ...segment,
                  src: exists ? pathToFileURL(assetPath).href : null,
                  exists,
                }
              })
            : [],
        }))
      : []

    const cursorDirectory = path.join(sessionDirectory, 'cursor')
    const cursorPath = path.join(cursorDirectory, 'cursor.json')
    const telemetryPath = path.join(cursorDirectory, 'telemetry.json')
    const shapesPath = path.join(cursorDirectory, 'shapes.json')
    const events = readCursorEvents(cursorPath)
    const telemetry = readCursorTelemetry(telemetryPath)
    let shapeMetadata = {}
    if (fs.existsSync(shapesPath)) {
      try {
        shapeMetadata = JSON.parse(fs.readFileSync(shapesPath, 'utf8')) || {}
      } catch {
        shapeMetadata = {}
      }
    }

    const shapes = {}
    for (const [shapeId, metadata] of Object.entries(shapeMetadata)) {
      const shapePath = path.join(cursorDirectory, 'shapes', `${shapeId}.png`)
      if (!fs.existsSync(shapePath)) continue
      shapes[shapeId] = {
        src: pathToFileURL(shapePath).href,
        hotspot: metadata?.hotspot || metadata || { x: 0, y: 0 },
      }
    }

    return {
      sessionId: session.sessionId,
      manifest: sessionManifest,
      videoSrc: video ? pathToFileURL(path.join(screenDirectory, video)).href : null,
      tracks,
      cursor: {
        available: Array.isArray(events),
        events: Array.isArray(events) ? events : [],
        telemetry,
        shapes,
        missing: [
          ...(Array.isArray(events) ? [] : ['cursor.json']),
          ...Object.keys(shapeMetadata).filter((shapeId) => !shapes[shapeId]).map((shapeId) => `shapes/${shapeId}.png`),
        ],
      },
      zoom: manifest.editor?.zoom ? validateZoomState(manifest.editor.zoom) : emptyZoomState(),
    }
  }

  return null
}

function projectsRoot() {
  return path.join(app.getPath('videos'), 'DemoRecorder')
}

function assertProjectId(projectId) {
  if (typeof projectId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new Error('Identifiant de projet invalide')
  }
  return projectId
}

function projectDirectory(projectId) {
  const validProjectId = assertProjectId(projectId)
  return path.join(projectsRoot(), `project-${validProjectId}`)
}

function projectSummary(projectDirectoryPath, manifest, fallbackId) {
  const sessions = Array.isArray(manifest.sessions) ? manifest.sessions : []
  const id = typeof manifest.projectId === 'string' ? manifest.projectId : fallbackId
  return {
    id,
    name: typeof manifest.name === 'string' && manifest.name.trim()
      ? manifest.name.trim()
      : `Project ${id.slice(0, 8)}`,
    createdAt: typeof manifest.createdAtUtc === 'string' ? manifest.createdAtUtc : '',
    updatedAt: typeof manifest.updatedAtUtc === 'string' ? manifest.updatedAtUtc : '',
    sessionCount: sessions.length,
    previewSrc: findProjectPreview(projectDirectoryPath, sessions),
  }
}

function generatedProjectName(projectId) {
  const adjectives = ['Bright', 'Calm', 'Clever', 'Golden', 'Quiet', 'Rapid', 'Soft', 'Vivid']
  const nouns = ['Aurora', 'Canvas', 'Comet', 'Horizon', 'Orbit', 'Pixel', 'Signal', 'Studio']
  const first = Number.parseInt(projectId.slice(0, 2), 16) % adjectives.length
  const second = Number.parseInt(projectId.slice(2, 4), 16) % nouns.length
  return `${adjectives[first]} ${nouns[second]}`
}

function readProjectManifest(projectDirectoryPath) {
  const manifestPath = path.join(projectDirectoryPath, 'project.json')
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
}

function listProjects() {
  const outputRoot = projectsRoot()
  if (!fs.existsSync(outputRoot)) return []

  return fs.readdirSync(outputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('project-'))
    .map((entry) => {
      const projectDirectory = path.join(outputRoot, entry.name)
      try {
        const manifest = readProjectManifest(projectDirectory)
        return projectSummary(projectDirectory, manifest, entry.name.slice('project-'.length))
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
}

ipcMain.handle('projects:list', () => listProjects())

ipcMain.handle('projects:editor-data', (_event, payload = {}) => {
  return readProjectEditorData(payload.projectId)
})

ipcMain.handle('projects:save-zoom-state', (_event, payload = {}) => {
  const directory = projectDirectory(payload.projectId)
  const manifest = readProjectManifest(directory)
  const zoom = validateZoomState(payload.zoom)
  manifest.editor = { ...(manifest.editor || {}), zoom }
  manifest.updatedAtUtc = new Date().toISOString()
  writeProjectManifest(directory, manifest)
  return zoom
})

ipcMain.handle('projects:create', (_event, options = {}) => {
  const id = randomUUID()
  const now = new Date().toISOString()
  const name = typeof options.name === 'string' && options.name.trim()
    ? options.name.trim().slice(0, 80)
    : generatedProjectName(id)
  fs.mkdirSync(projectsRoot(), { recursive: true })
  const directory = projectDirectory(id)
  fs.mkdirSync(directory, { recursive: false })
  const manifest = {
    schemaVersion: 1,
    projectId: id,
    name,
    createdAtUtc: now,
    updatedAtUtc: now,
    sessions: [],
  }
  writeProjectManifest(directory, manifest)
  return projectSummary(directory, manifest, id)
})

ipcMain.handle('projects:rename', (_event, payload = {}) => {
  const directory = projectDirectory(payload.projectId)
  const manifest = readProjectManifest(directory)
  const name = typeof payload.name === 'string' ? payload.name.trim().slice(0, 80) : ''
  if (!name) throw new Error('Le nom du projet ne peut pas être vide')
  manifest.name = name
  manifest.updatedAtUtc = new Date().toISOString()
  writeProjectManifest(directory, manifest)
  return projectSummary(directory, manifest, payload.projectId)
})

ipcMain.handle('projects:delete', (_event, payload = {}) => {
  const directory = projectDirectory(payload.projectId)
  if (!fs.existsSync(directory)) throw new Error('Projet introuvable')
  fs.rmSync(directory, { recursive: true, force: false })
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

ipcMain.on('window:maximize', (event) => {
  const webContents = event.sender
  const win = BrowserWindow.fromWebContents(webContents)
  if (win) {
    win.setAlwaysOnTop(false)
    win.maximize()
  }
})

ipcMain.on('window:unmaximize', (event) => {
  const webContents = event.sender
  const win = BrowserWindow.fromWebContents(webContents)
  if (win) {
    win.setAlwaysOnTop(true)
    win.unmaximize()
  }
})

ipcMain.on('window:toggleMaximize', (event) => {
  const webContents = event.sender
  const win = BrowserWindow.fromWebContents(webContents)
  if (win) {
    if (win.isMaximized()) {
      win.setAlwaysOnTop(true)
      win.unmaximize()
    } else {
      win.setAlwaysOnTop(false)
      win.maximize()
    }
  }
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

let resizeInterval = null
ipcMain.on('window:setSizeSmooth', (event, width, height) => {
  const webContents = event.sender
  const win = BrowserWindow.fromWebContents(webContents)
  if (win) {
    const [currWidth, currHeight] = win.getSize()
    const targetWidth = Math.round(width)
    const targetHeight = Math.round(height)
    
    if (resizeInterval) {
      clearInterval(resizeInterval)
    }
    
    if (Math.abs(currHeight - targetHeight) < 5) {
      win.setSize(targetWidth, targetHeight)
      return
    }
    
    const steps = 12
    let step = 0
    
    win.setResizable(true)
    
    resizeInterval = setInterval(() => {
      step++
      const ease = 1 - Math.pow(1 - (step / steps), 3)
      const nextWidth = Math.round(currWidth + (targetWidth - currWidth) * ease)
      const nextHeight = Math.round(currHeight + (targetHeight - currHeight) * ease)
      
      win.setSize(nextWidth, nextHeight)
      
      if (step >= steps) {
        clearInterval(resizeInterval)
        win.setResizable(false)
      }
    }, 16)
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
    icon: path.join(__dirname, 'public/brand/DemoRecorderIcon.png'),
    resizable: false,
    maximizable: false,
    hasShadow: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
    },
  })

  win.once('ready-to-show', () => {
    win.showInactive()
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
