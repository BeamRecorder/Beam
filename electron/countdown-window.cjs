const { BrowserWindow, screen } = require('electron')
const path = require('path')

function createCountdownWindow({ applicationRoot, isPackaged }) {
  let window = null
  let seconds = null
  let ready = false
  const show = (value) => {
    seconds = value
    if (value === null) { window?.hide(); return }
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const size = 192
    if (!window || window.isDestroyed()) {
      window = new BrowserWindow({ width: size, height: size, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, focusable: false, hasShadow: false, webPreferences: { preload: path.join(applicationRoot, 'electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false } })
      window.setIgnoreMouseEvents(true)
      window.webContents.once('did-finish-load', () => { ready = true; window?.webContents.send('countdown:state', seconds); window?.showInactive() })
      if (isPackaged) window.loadFile(path.join(applicationRoot, 'dist/index.html'), { query: { countdown: '1' } })
      else window.loadURL('http://localhost:6500/?countdown=1')
    }
    window.setPosition(display.workArea.x + Math.round((display.workArea.width - size) / 2), display.workArea.y + Math.round((display.workArea.height - size) / 2))
    if (ready) { window.webContents.send('countdown:state', value); window.showInactive() }
  }
  return { show, destroy: () => window?.destroy() }
}

module.exports = { createCountdownWindow }
