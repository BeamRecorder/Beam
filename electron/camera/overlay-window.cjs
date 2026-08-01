const { BrowserWindow, screen } = require('electron')
const path = require('path')

const DEFAULT_SIZE = { width: 320, height: 180 }
const MIN_SIZE = { width: 120, height: 90 }

function createCameraOverlayWindow({ applicationRoot, isPackaged }) {
  let window = null
  let currentState = null
  let hoverTimer = null
  let isHovered = false
  let active = true

  const load = (target, query) => {
    if (isPackaged) target.loadFile(path.join(applicationRoot, 'dist/index.html'), { query })
    else target.loadURL(`http://localhost:6500/?${new URLSearchParams(query).toString()}`)
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

  const create = () => {
    if (window && !window.isDestroyed()) return window
    const area = screen.getPrimaryDisplay().workArea
    window = new BrowserWindow({ width: DEFAULT_SIZE.width, height: DEFAULT_SIZE.height, minWidth: MIN_SIZE.width, minHeight: MIN_SIZE.height, x: area.x + area.width - DEFAULT_SIZE.width - 20, y: area.y + area.height - DEFAULT_SIZE.height - 20, frame: false, transparent: true, backgroundColor: '#00000000', alwaysOnTop: true, skipTaskbar: true, resizable: true, hasShadow: false, webPreferences: { preload: path.join(applicationRoot, 'electron/preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: false } })
    window.setContentProtection(true)
    window.setAlwaysOnTop(true, 'floating')
    window.on('closed', () => { window = null; stopHoverTracking() })
    window.webContents.once('did-finish-load', () => { if (currentState) window?.webContents.send('camera-overlay:state', currentState) })
    load(window, { cameraOverlay: '1' })
    return window
  }

  const configure = (state) => {
    currentState = { cameraId: state?.cameraId || 'off' }
    if (!active || currentState.cameraId === 'off') {
      if (window && !window.isDestroyed()) {
        window.webContents.send('camera-overlay:state', { ...currentState, cameraId: 'off' })
        window.hide()
      }
      return
    }
    const overlay = create()
    overlay.webContents.send('camera-overlay:state', currentState)
    overlay.showInactive()
    overlay.moveTop()
    startHoverTracking()
  }

  const setActive = (next) => {
    active = Boolean(next)
    configure(currentState || { cameraId: 'off' })
  }

  const resetPlacement = () => {
    if (!window || window.isDestroyed()) return false
    const bounds = window.getBounds()
    const area = screen.getDisplayMatching(bounds).workArea
    window.setPosition(
      Math.round(area.x + area.width - bounds.width - 20),
      Math.round(area.y + area.height - bounds.height - 20),
    )
    return true
  }

  const state = () => {
    if (!currentState) return null
    if (!window || window.isDestroyed()) return currentState
    const bounds = window.getBounds()
    const display = screen.getDisplayMatching(bounds).workArea
    return {
      ...currentState,
      placement: {
        x: (bounds.x - display.x) / display.width,
        y: (bounds.y - display.y) / display.height,
        width: bounds.width / display.width,
        height: bounds.height / display.height,
      },
    }
  }

  return { configure, setActive, resetPlacement, state, destroy: () => { stopHoverTracking(); if (window && !window.isDestroyed()) window.destroy() } }
}

module.exports = { createCameraOverlayWindow }
