const { BrowserWindow, screen } = require('electron')
const path = require('path')

const DEFAULT_SIZE = { width: 320, height: 180 }
const MIN_SIZE = { width: 120, height: 90 }
const SHADOW_PADDING = { none: 0, sm: 16, md: 32, lg: 52 }

function createCameraOverlayWindow({ applicationRoot, isPackaged }) {
  let window = null
  let shadowWindow = null
  let currentState = null

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
    if (padding === 0) { shadowWindow.hide(); return }
    const bounds = window.getBounds()
    shadowWindow.setBounds({ x: bounds.x - padding, y: bounds.y - padding, width: bounds.width + padding * 2, height: bounds.height + padding * 2 })
    shadowWindow.webContents.send('camera-shadow:state', currentState)
    shadowWindow.showInactive()
    window.moveTop()
  }

  const create = () => {
    if (window && !window.isDestroyed()) return window
    const area = screen.getPrimaryDisplay().workArea
    window = new BrowserWindow({ width: DEFAULT_SIZE.width, height: DEFAULT_SIZE.height, minWidth: MIN_SIZE.width, minHeight: MIN_SIZE.height, x: area.x + area.width - DEFAULT_SIZE.width - 20, y: area.y + area.height - DEFAULT_SIZE.height - 20, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: true, hasShadow: false, webPreferences: { preload: path.join(applicationRoot, 'electron/preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: false } })
    window.setAlwaysOnTop(true, 'floating')
    window.on('move', syncShadowBounds)
    window.on('resize', syncShadowBounds)
    window.on('closed', () => { window = null; shadowWindow?.hide() })
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
  }

  return { configure, state: () => currentState, destroy: () => { if (window && !window.isDestroyed()) window.destroy(); if (shadowWindow && !shadowWindow.isDestroyed()) shadowWindow.destroy() } }
}

module.exports = { createCameraOverlayWindow }
