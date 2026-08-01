const { BrowserWindow, screen } = require('electron')
const path = require('path')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_BOUNDS = { width: 640, height: 400 }
const MIN_BOUNDS = { width: 240, height: 140 }
const isContentProtectionSupported = (platform) => platform === 'win32' || platform === 'darwin'

const clampTeleprompterBounds = (bounds, area) => {
  const width = Math.min(Math.max(Math.round(Number(bounds?.width) || DEFAULT_BOUNDS.width), MIN_BOUNDS.width), area.width)
  const height = Math.min(Math.max(Math.round(Number(bounds?.height) || DEFAULT_BOUNDS.height), MIN_BOUNDS.height), area.height)
  const minX = area.x
  const minY = area.y
  const maxX = area.x + Math.max(0, area.width - width)
  const maxY = area.y + Math.max(0, area.height - height)
  return {
    x: Math.min(Math.max(Math.round(Number(bounds?.x) || minX), minX), maxX),
    y: Math.min(Math.max(Math.round(Number(bounds?.y) || minY), minY), maxY),
    width,
    height,
  }
}

const validContext = (context) => context && typeof context === 'object' && UUID.test(context.projectId) && UUID.test(context.sessionId)

function createTeleprompterWindow({ applicationRoot, isPackaged, preferencesStore = null }) {
  let window = null
  let currentSession = null
  let ready = false
  let rendererReady = false
  let requestedVisible = false
  let persistTimer = null

  const flushBounds = () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = null
    if (!preferencesStore || !window || window.isDestroyed()) return
    try {
      preferencesStore.patch({ extras: { teleprompterWindow: window.getBounds() } })
    } catch {
      // Window persistence is best effort and must not affect the window.
    }
  }

  const scheduleBoundsPersistence = () => {
    if (!preferencesStore || !window || window.isDestroyed()) return
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      flushBounds()
    }, 150)
  }

  const load = (target) => {
    if (isPackaged) target.loadFile(path.join(applicationRoot, 'dist/teleprompter.html'))
    else target.loadURL('http://localhost:6500/teleprompter.html')
  }

  const notifyVisibility = () => {
    const visible = Boolean(window && !window.isDestroyed() && window.isVisible())
    for (const target of BrowserWindow.getAllWindows()) {
      if (target !== window && !target.isDestroyed()) target.webContents.send('teleprompter:visibility', visible)
    }
  }

  const sendSession = () => {
    if (!ready || !rendererReady || !window || window.isDestroyed()) return
    window.webContents.send('teleprompter:session', currentSession)
  }

  const ensure = () => {
    if (window && !window.isDestroyed()) return window
    const savedBounds = preferencesStore?.read()?.extras?.teleprompterWindow
    const savedDisplay = savedBounds && Number.isFinite(Number(savedBounds.x)) && Number.isFinite(Number(savedBounds.y))
      ? screen.getDisplayNearestPoint({ x: Number(savedBounds.x), y: Number(savedBounds.y) })
      : null
    const display = savedDisplay || screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const area = display.workArea
    const initialBounds = clampTeleprompterBounds(
      savedBounds || {
        x: area.x + Math.round((area.width - DEFAULT_BOUNDS.width) / 2),
        y: area.y + Math.round((area.height - DEFAULT_BOUNDS.height) / 2),
        ...DEFAULT_BOUNDS,
      },
      area,
    )
    window = new BrowserWindow({
      ...initialBounds,
      minWidth: MIN_BOUNDS.width,
      minHeight: MIN_BOUNDS.height,
      frame: false,
      transparent: false,
      backgroundColor: '#f7f5f0',
      alwaysOnTop: true,
      skipTaskbar: false,
      resizable: true,
      movable: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: path.join(applicationRoot, 'electron/preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    })
    if (isContentProtectionSupported(process.platform) && typeof window.setContentProtection === 'function') window.setContentProtection(true)
    window.setAlwaysOnTop(true, 'floating')
    ready = false
    rendererReady = false
    window.on('show', notifyVisibility)
    window.on('hide', notifyVisibility)
    window.on('move', scheduleBoundsPersistence)
    window.on('resize', scheduleBoundsPersistence)
    window.on('close', flushBounds)
    window.on('closed', () => { ready = false; rendererReady = false; requestedVisible = false; window = null; notifyVisibility() })
    window.webContents.once('did-finish-load', () => {
      ready = true
      sendSession()
      if (requestedVisible && window && !window.isDestroyed()) {
        window.showInactive()
        window.moveTop()
      }
    })
    load(window)
    return window
  }

  const show = () => {
    requestedVisible = true
    const target = ensure()
    if (ready) {
      target.show()
      target.moveTop()
    }
    return true
  }
  const showInactive = () => {
    requestedVisible = true
    const target = ensure()
    if (ready) {
      target.showInactive()
      target.moveTop()
    }
    return true
  }
  const hide = () => { requestedVisible = false; if (window && !window.isDestroyed()) window.hide(); return true }
  const toggle = () => (window && !window.isDestroyed() && window.isVisible() ? hide() : showInactive())
  const setSession = (context) => {
    currentSession = context === null ? null : (validContext(context) ? { projectId: context.projectId, sessionId: context.sessionId } : null)
    sendSession()
  }
  const markRendererReady = () => {
    if (!window || window.isDestroyed()) return false
    rendererReady = true
    sendSession()
    return true
  }
  const handleShortcut = (id) => {
    if (id === 'teleprompter.toggleVisibility') return toggle()
    if (!['teleprompter.toggleAutoscroll', 'teleprompter.nextLine', 'teleprompter.previousLine'].includes(id)) return false
    if (!window || window.isDestroyed()) return false
    window.webContents.send('teleprompter:shortcut', id)
    return true
  }

  return {
    prepare: () => { ensure(); return true },
    show,
    showInactive,
    hide,
    toggle,
    setSession,
    markRendererReady,
    handleShortcut,
    isVisible: () => Boolean(window && !window.isDestroyed() && window.isVisible()),
    bounds: () => window && !window.isDestroyed() ? window.getBounds() : null,
    destroy: () => { flushBounds(); if (window && !window.isDestroyed()) window.destroy(); window = null },
  }
}

module.exports = { DEFAULT_BOUNDS, MIN_BOUNDS, clampTeleprompterBounds, isContentProtectionSupported, createTeleprompterWindow }
