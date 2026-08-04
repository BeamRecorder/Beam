const { BrowserWindow } = require('electron')
const path = require('path')

function finiteBounds(value) {
  if (!value || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key])))
    throw new Error('Screen overlay bounds are invalid')
  if (value.width <= 0 || value.height <= 0) throw new Error('Screen overlay size is invalid')
  return {
    x: Math.round(value.x),
    y: Math.round(value.y),
    width: Math.round(value.width),
    height: Math.round(value.height),
  }
}

function createScreenRegionOverlayWindow({ applicationRoot, isPackaged }) {
  let window = null
  let ready = false
  let pending = null
  let current = null

  const send = (options) => {
    if (!window || window.isDestroyed() || !ready) return
    window.webContents.send('screen-region:configure', options)
  }

  const ensureWindow = () => {
    if (window && !window.isDestroyed()) return window
    window = new BrowserWindow({
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      focusable: true,
      skipTaskbar: true,
      show: false,
      alwaysOnTop: true,
      webPreferences: {
        preload: path.join(applicationRoot, 'electron/preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    })
    window.setContentProtection(true)
    window.once('ready-to-show', () => {
      ready = true
      send(current)
    })
    window.on('closed', () => {
      ready = false
      window = null
      if (pending) {
        pending.resolve(null)
        pending = null
      }
    })
    if (isPackaged) window.loadFile(path.join(applicationRoot, 'dist/index.html'), { query: { screenRegion: '1' } })
    else window.loadURL('http://localhost:6500/?screenRegion=1')
    return window
  }

  const configure = (options, interactive) => {
    const target = ensureWindow()
    current = { ...options, bounds: finiteBounds(options.bounds), mode: interactive ? 'select' : 'record' }
    target.setBounds(current.bounds)
    target.setIgnoreMouseEvents(!interactive)
    send(current)
    if (interactive) {
      target.show()
      target.focus()
    } else {
      target.showInactive()
    }
    target.moveTop()
  }

  return {
    select(options) {
      if (pending) {
        pending.resolve(null)
        pending = null
      }
      const result = new Promise((resolve) => {
        pending = { resolve }
      })
      configure(options, true)
      return result
    },
    show(options) {
      configure(options, false)
    },
    hide() {
      current = null
      if (window && !window.isDestroyed()) window.hide()
    },
    confirm(region) {
      if (!pending) return
      const resolve = pending.resolve
      pending = null
      current = null
      window?.hide()
      resolve(region)
    },
    cancel() {
      if (!pending) return
      const resolve = pending.resolve
      pending = null
      current = null
      window?.hide()
      resolve(null)
    },
    destroy() {
      if (pending) {
        pending.resolve(null)
        pending = null
      }
      window?.destroy()
      window = null
    },
  }
}

module.exports = { createScreenRegionOverlayWindow }
