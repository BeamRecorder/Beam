const { BrowserWindow, screen } = require('electron')
const path = require('path')

const DEFAULT_SIZE = { width: 320, height: 180 }
const MIN_SIZE = { width: 120, height: 90 }

function createCameraOverlayWindow({ applicationRoot, isPackaged }) {
  let window = null
  let currentState = null

  const create = () => {
    if (window && !window.isDestroyed()) return window
    const area = screen.getPrimaryDisplay().workArea
    window = new BrowserWindow({
      ...DEFAULT_SIZE,
      minWidth: MIN_SIZE.width,
      minHeight: MIN_SIZE.height,
      x: area.x + area.width - DEFAULT_SIZE.width - 20,
      y: area.y + area.height - DEFAULT_SIZE.height - 20,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      hasShadow: false,
      webPreferences: { preload: path.join(applicationRoot, 'electron/preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: false },
    })
    window.setAlwaysOnTop(true, 'floating')
    window.on('closed', () => { window = null })
    window.webContents.once('did-finish-load', () => { if (currentState) window?.webContents.send('camera-overlay:state', currentState) })
    if (isPackaged) window.loadFile(path.join(applicationRoot, 'dist/index.html'), { query: { cameraOverlay: '1' } })
    else window.loadURL('http://localhost:6500/?cameraOverlay=1')
    return window
  }

  const configure = (state) => {
    currentState = {
      cameraId: state?.cameraId || 'off',
      shadowSize: ['none', 'sm', 'md', 'lg'].includes(state?.shadowSize) ? state.shadowSize : currentState?.shadowSize || 'md',
      cornerRadius: ['none', 'sm', 'md', 'lg', 'full'].includes(state?.cornerRadius) ? state.cornerRadius : currentState?.cornerRadius || 'md',
    }
    if (currentState.cameraId === 'off') { if (window && !window.isDestroyed()) window.hide(); return }
    const overlay = create()
    overlay.webContents.send('camera-overlay:state', currentState)
    overlay.showInactive()
  }

  return { configure, state: () => currentState, destroy: () => { if (window && !window.isDestroyed()) window.destroy() } }
}

module.exports = { createCameraOverlayWindow }
