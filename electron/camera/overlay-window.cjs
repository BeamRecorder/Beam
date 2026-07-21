const { BrowserWindow, screen } = require('electron')
const path = require('path')

const SIZES = { sm: [120, 90], md: [160, 120], lg: [220, 165], xl: [300, 225] }

function createCameraOverlayWindow({ applicationRoot, isPackaged }) {
  let window = null
  let currentState = null
  const create = () => {
    if (window && !window.isDestroyed()) return window
    const [width, height] = SIZES.md
    const area = screen.getPrimaryDisplay().workArea
    window = new BrowserWindow({ width, height, x: area.x + area.width - width - 20, y: area.y + area.height - height - 20, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, hasShadow: false, webPreferences: { preload: path.join(applicationRoot, 'electron/preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: false, webSecurity: false } })
    window.setAlwaysOnTop(true, 'floating'); window.on('closed', () => { window = null })
    window.webContents.once('did-finish-load', () => { if (currentState) window?.webContents.send('camera-overlay:state', currentState) })
    if (isPackaged) window.loadFile(path.join(applicationRoot, 'dist/index.html'), { query: { cameraOverlay: '1' } })
    else window.loadURL('http://localhost:6500/?cameraOverlay=1')
    return window
  }
  const configure = (state) => {
    currentState = state
    if (!state?.cameraId || state.cameraId === 'off') { if (window && !window.isDestroyed()) window.hide(); return }
    const overlay = create(); const [width, height] = SIZES[state.size] || SIZES.md; const [x, y] = overlay.getPosition(); overlay.setBounds({ x, y, width, height }); overlay.webContents.send('camera-overlay:state', state); overlay.showInactive()
  }
  return { configure, state: () => currentState, destroy: () => { if (window && !window.isDestroyed()) window.destroy() } }
}
module.exports = { createCameraOverlayWindow }
