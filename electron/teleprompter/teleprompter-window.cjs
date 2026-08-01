const { BrowserWindow, screen } = require('electron')
const path = require('path')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_BOUNDS = { width: 920, height: 620 }
const MIN_BOUNDS = { width: 440, height: 280 }
const isContentProtectionSupported = (platform) => platform === 'win32' || platform === 'darwin'

const validContext = (context) => context && typeof context === 'object' && UUID.test(context.projectId) && UUID.test(context.sessionId)

function createTeleprompterWindow({ applicationRoot, isPackaged }) {
  let window = null
  let currentSession = null

  const load = (target) => {
    if (isPackaged) target.loadFile(path.join(applicationRoot, 'dist/index.html'), { query: { teleprompter: '1' } })
    else target.loadURL('http://localhost:6500/?teleprompter=1')
  }

  const sendSession = () => {
    if (window && !window.isDestroyed() && window.webContents.getURL()) window.webContents.send('teleprompter:session', currentSession)
  }

  const ensure = () => {
    if (window && !window.isDestroyed()) return window
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const area = display.workArea
    window = new BrowserWindow({
      ...DEFAULT_BOUNDS,
      minWidth: MIN_BOUNDS.width,
      minHeight: MIN_BOUNDS.height,
      x: area.x + Math.round((area.width - DEFAULT_BOUNDS.width) / 2),
      y: area.y + Math.round((area.height - DEFAULT_BOUNDS.height) / 2),
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
    window.on('closed', () => { window = null })
    window.webContents.once('did-finish-load', sendSession)
    load(window)
    return window
  }

  const show = () => {
    const target = ensure()
    target.show()
    target.moveTop()
    return true
  }
  const showInactive = () => {
    const target = ensure()
    target.showInactive()
    target.moveTop()
    return true
  }
  const hide = () => { if (window && !window.isDestroyed()) window.hide(); return true }
  const toggle = () => (window && !window.isDestroyed() && window.isVisible() ? hide() : showInactive())
  const setSession = (context) => {
    currentSession = context === null ? null : (validContext(context) ? { projectId: context.projectId, sessionId: context.sessionId } : null)
    sendSession()
  }
  const handleShortcut = (id) => {
    if (id === 'teleprompter.toggleVisibility') return toggle()
    if (!['teleprompter.toggleAutoscroll', 'teleprompter.nextLine', 'teleprompter.previousLine'].includes(id)) return false
    if (!window || window.isDestroyed()) return false
    window.webContents.send('teleprompter:shortcut', id)
    return true
  }

  return {
    show,
    showInactive,
    hide,
    toggle,
    setSession,
    handleShortcut,
    isVisible: () => Boolean(window && !window.isDestroyed() && window.isVisible()),
    bounds: () => window && !window.isDestroyed() ? window.getBounds() : null,
    destroy: () => { if (window && !window.isDestroyed()) window.destroy(); window = null },
  }
}

module.exports = { DEFAULT_BOUNDS, MIN_BOUNDS, isContentProtectionSupported, createTeleprompterWindow }
