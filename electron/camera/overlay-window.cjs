const { BrowserWindow, screen } = require('electron')
const path = require('path')

const DEFAULT_SIZE = { width: 320, height: 180 }
const MIN_SIZE = { width: 120, height: 90 }
const SHADOW_PADDING = { none: 0, sm: 16, md: 32, lg: 52 }

function createCameraOverlayWindow({ applicationRoot, isPackaged }) {
  let window = null
  let shadowWindow = null
  let currentState = null
  let hoverTimer = null
  let shadowSyncFrame = null
  let isHovered = false
  let lastShadowBounds = null

  const load = (target, query) => {
    if (isPackaged) target.loadFile(path.join(applicationRoot, 'dist/index.html'), { query })
    else target.loadURL(`http://localhost:6500/?${new URLSearchParams(query).toString()}`)
  }

  const ensureShadowWindow = () => {
    if (shadowWindow && !shadowWindow.isDestroyed()) return shadowWindow
    shadowWindow = new BrowserWindow({ frame: false, transparent: true, focusable: false, alwaysOnTop: true, skipTaskbar: true, resizable: false, hasShadow: false, show: false, webPreferences: { preload: path.join(applicationRoot, 'electron/preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: false } })
    shadowWindow.setAlwaysOnTop(true, 'floating')
    shadowWindow.setIgnoreMouseEvents(true, { forward: false })
    shadowWindow.on('closed', () => { shadowWindow = null })
    shadowWindow.webContents.once('did-finish-load', () => shadowWindow?.webContents.send('camera-shadow:state', currentState))
    load(shadowWindow, { cameraShadow: '1' })
    return shadowWindow
  }

  const syncShadowBounds = () => {
    if (!window || window.isDestroyed() || !shadowWindow || shadowWindow.isDestroyed() || !currentState) return
    const padding = SHADOW_PADDING[currentState.shadowSize]
    if (padding === 0) {
      lastShadowBounds = null
      if (shadowWindow.isVisible()) shadowWindow.hide()
      return
    }
    const bounds = window.getBounds()
    const nextBounds = { x: bounds.x - padding, y: bounds.y - padding, width: bounds.width + padding * 2, height: bounds.height + padding * 2 }
    if (lastShadowBounds && Object.entries(nextBounds).every(([key, value]) => lastShadowBounds[key] === value)) return
    lastShadowBounds = nextBounds
    shadowWindow.setBounds(nextBounds)
    if (!shadowWindow.isVisible()) {
      shadowWindow.showInactive()
      window.moveTop()
    }
  }

  const scheduleShadowSync = () => {
    if (shadowSyncFrame) return
    // BrowserWindow lives in Electron's main process, where requestAnimationFrame
    // is unavailable. A 16 ms frame budget provides the same coalescing behavior.
    shadowSyncFrame = setTimeout(() => {
      shadowSyncFrame = null
      syncShadowBounds()
    }, 16)
  }

  const syncHoverState = () => {
    if (!window || window.isDestroyed()) return
    const bounds = window.getBounds()
    const point = screen.getCursorScreenPoint()
    const next = point.x >= bounds.x && point.x < bounds.x + bounds.width && point.y >= bounds.y && point.y < bounds.y + bounds.height
    if (next === isHovered) return
    isHovered = next
    window.webContents.send('camera-overlay:hover', next)
  }

  const startHoverTracking = () => {
    if (hoverTimer) return
    hoverTimer = setInterval(syncHoverState, 80)
  }

  const stopHoverTracking = () => {
    if (!hoverTimer) return
    clearInterval(hoverTimer)
    hoverTimer = null
    isHovered = false
  }

  const cancelShadowSync = () => {
    if (!shadowSyncFrame) return
    clearTimeout(shadowSyncFrame)
    shadowSyncFrame = null
  }

  const create = () => {
    if (window && !window.isDestroyed()) return window
    const area = screen.getPrimaryDisplay().workArea
    window = new BrowserWindow({ width: DEFAULT_SIZE.width, height: DEFAULT_SIZE.height, minWidth: MIN_SIZE.width, minHeight: MIN_SIZE.height, x: area.x + area.width - DEFAULT_SIZE.width - 20, y: area.y + area.height - DEFAULT_SIZE.height - 20, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: true, hasShadow: false, webPreferences: { preload: path.join(applicationRoot, 'electron/preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: false } })
    window.setAlwaysOnTop(true, 'floating')
    window.on('move', scheduleShadowSync)
    window.on('resize', scheduleShadowSync)
    window.on('closed', () => { window = null; shadowWindow?.hide(); stopHoverTracking(); cancelShadowSync() })
    window.webContents.once('did-finish-load', () => { if (currentState) window?.webContents.send('camera-overlay:state', currentState) })
    load(window, { cameraOverlay: '1' })
    return window
  }

  const configure = (state) => {
    currentState = { cameraId: state?.cameraId || 'off', shadowSize: ['none', 'sm', 'md', 'lg'].includes(state?.shadowSize) ? state.shadowSize : currentState?.shadowSize || 'md', cornerRadius: ['none', 'sm', 'md', 'lg', 'full'].includes(state?.cornerRadius) ? state.cornerRadius : currentState?.cornerRadius || 'md' }
    if (currentState.cameraId === 'off') { if (window && !window.isDestroyed()) window.hide(); if (shadowWindow && !shadowWindow.isDestroyed()) shadowWindow.hide(); return }
    const shadow = ensureShadowWindow()
    const overlay = create()
    overlay.webContents.send('camera-overlay:state', currentState)
    shadow.webContents.send('camera-shadow:state', currentState)
    syncShadowBounds()
    overlay.showInactive()
    overlay.moveTop()
    startHoverTracking()
  }

  return { configure, state: () => currentState, destroy: () => { stopHoverTracking(); cancelShadowSync(); if (window && !window.isDestroyed()) window.destroy(); if (shadowWindow && !shadowWindow.isDestroyed()) shadowWindow.destroy() } }
}

module.exports = { createCameraOverlayWindow }
