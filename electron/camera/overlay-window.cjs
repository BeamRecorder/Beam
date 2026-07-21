const { BrowserWindow, screen } = require('electron')
const path = require('path')
const { CAMERA_WINDOW_PADDING, clampOverlayBounds, previewOffset } = require('./overlay-bounds.cjs')

const SIZES = { sm: [120, 90], md: [160, 120], lg: [220, 165], xl: [300, 225] }
const PADDING = CAMERA_WINDOW_PADDING

function createCameraOverlayWindow({ applicationRoot, isPackaged }) {
  let window = null
  let settingsWindow = null
  let settingsReady = false
  let settingsRequested = false
  let lastSettingsToggleAt = 0
  let currentState = null
  let popoverRestoreBounds = null
  const ensureSettingsWindow = () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) return settingsWindow
    settingsReady = false
    settingsWindow = new BrowserWindow({ width: 272, height: 312, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, hasShadow: false, show: false, webPreferences: { preload: path.join(applicationRoot, 'electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false } })
    settingsWindow.setAlwaysOnTop(true, 'floating')
    settingsWindow.webContents.once('did-finish-load', () => settingsWindow?.webContents.send('camera-overlay:state', currentState))
    settingsWindow.once('ready-to-show', () => { settingsReady = true; if (settingsRequested) settingsWindow?.show() })
    if (isPackaged) settingsWindow.loadFile(path.join(applicationRoot, 'dist/index.html'), { query: { cameraSettings: '1' } })
    else settingsWindow.loadURL('http://localhost:6500/?cameraSettings=1')
    return settingsWindow
  }
  const create = () => {
    if (window && !window.isDestroyed()) return window
    const [contentWidth, contentHeight] = SIZES.md; const width = contentWidth + PADDING * 2; const height = contentHeight + PADDING * 2
    const area = screen.getPrimaryDisplay().workArea
    window = new BrowserWindow({
      width,
      height,
      x: area.x + area.width - width - 20,
      y: area.y + area.height - height - 20,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      webPreferences: {
        preload: path.join(applicationRoot, 'electron/preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webSecurity: false,
      },
    })
    window.setAlwaysOnTop(true, 'floating'); window.setIgnoreMouseEvents(true, { forward: true }); window.on('closed', () => { window = null })
    window.webContents.once('did-finish-load', () => { if (currentState) window?.webContents.send('camera-overlay:state', currentState) })
    if (isPackaged) window.loadFile(path.join(applicationRoot, 'dist/index.html'), { query: { cameraOverlay: '1' } })
    else window.loadURL('http://localhost:6500/?cameraOverlay=1')
    return window
  }
  const configure = (state) => {
    currentState = state
    if (!state?.cameraId || state.cameraId === 'off') { if (window && !window.isDestroyed()) window.hide(); return }
    const overlay = create(); const settings = ensureSettingsWindow(); const [contentWidth, contentHeight] = SIZES[state.size] || SIZES.md; const width = contentWidth + PADDING * 2; const height = contentHeight + PADDING * 2
    const currentBounds = overlay.getBounds()
    const previousBounds = popoverRestoreBounds || currentBounds
    const area = screen.getDisplayNearestPoint(previousBounds).workArea
    if (!popoverRestoreBounds) {
      overlay.setBounds(clampOverlayBounds({ x: previousBounds.x, y: previousBounds.y, width, height }, area))
    }
    overlay.webContents.send('camera-overlay:state', state); settings.webContents.send('camera-overlay:state', state); overlay.showInactive()
  }
  const resize = ({ width, height, popoverOpen }) => {
    if (!window || window.isDestroyed()) return { x: 0, y: 0 }
    if (!popoverOpen) {
      const compactBounds = popoverRestoreBounds || window.getBounds()
      const area = screen.getDisplayNearestPoint(compactBounds).workArea
      popoverRestoreBounds = null
      const nextBounds = clampOverlayBounds({ x: compactBounds.x, y: compactBounds.y, width, height }, area)
      window.setBounds(nextBounds)
      return { x: 0, y: 0 }
    }
    popoverRestoreBounds ||= window.getBounds()
    const area = screen.getDisplayNearestPoint(popoverRestoreBounds).workArea
    const expandedBounds = clampOverlayBounds({ x: popoverRestoreBounds.x, y: popoverRestoreBounds.y, width, height }, area)
    window.setBounds(expandedBounds)
    return previewOffset(popoverRestoreBounds, expandedBounds)
  }
  const setInteractive = (interactive) => { if (window && !window.isDestroyed()) window.setIgnoreMouseEvents(!interactive, interactive ? undefined : { forward: true }) }
  const toggleSettings = () => {
    const now = Date.now()
    if (now - lastSettingsToggleAt < 250) return
    lastSettingsToggleAt = now
    if (!window || window.isDestroyed() || !currentState) return
    if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) { settingsRequested = false; return settingsWindow.hide() }
    const [x, y] = window.getPosition(); const [width] = window.getSize(); const area = screen.getDisplayNearestPoint({ x, y }).workArea
    const settingsWidth = 272; const settingsHeight = 312; const right = x + width + 8
    const settingsX = right + settingsWidth <= area.x + area.width ? right : Math.max(area.x, x - settingsWidth - 8)
    const settingsY = Math.max(area.y, Math.min(y, area.y + area.height - settingsHeight))
    ensureSettingsWindow()
    settingsWindow.setPosition(settingsX, settingsY)
    settingsRequested = true
    if (settingsReady) { settingsWindow.webContents.send('camera-overlay:state', currentState); settingsWindow.show() }
  }
  return { configure, resize, setInteractive, toggleSettings, state: () => currentState, destroy: () => { if (window && !window.isDestroyed()) window.destroy(); if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.destroy() } }
}
module.exports = { createCameraOverlayWindow }
