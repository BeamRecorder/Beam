const { BrowserWindow, screen } = require('electron')

function windowForEvent(event) {
  return BrowserWindow.fromWebContents(event.sender)
}

function registerWindowIpc(ipcMain, controllerForWindow) {
  let resizeTimer = null
  let dragStartMouse = null
  let dragStartWindow = null
  let dragStartSize = null

  ipcMain.on('window:close', (event) => windowForEvent(event)?.close())
  ipcMain.on('window:minimize', (event) => windowForEvent(event)?.minimize())
  ipcMain.on('window:set-mode', (event, mode) => controllerForWindow(windowForEvent(event))?.setMode(mode))
  ipcMain.on('window:maximize', (event) => controllerForWindow(windowForEvent(event))?.maximize())
  ipcMain.on('window:unmaximize', (event) => controllerForWindow(windowForEvent(event))?.restore())
  ipcMain.on('window:toggleMaximize', (event) => controllerForWindow(windowForEvent(event))?.toggleMaximize())
  ipcMain.on('window:present', (event) => controllerForWindow(windowForEvent(event))?.present())
  ipcMain.on('window:setPosition', (event, x, y) => windowForEvent(event)?.setPosition(Math.round(x), Math.round(y)))
  ipcMain.on('window:setSize', (event, width, height) => windowForEvent(event)?.setSize(Math.round(width), Math.round(height)))
  ipcMain.on('window:setSizeSmooth', (event, width, height) => {
    const win = windowForEvent(event)
    if (!win) return
    if (resizeTimer) clearInterval(resizeTimer)
    const [currentWidth, currentHeight] = win.getSize()
    const targetWidth = Math.round(width)
    const targetHeight = Math.round(height)
    if (Math.abs(currentHeight - targetHeight) < 5) return win.setSize(targetWidth, targetHeight)
    let step = 0
    win.setResizable(true)
    resizeTimer = setInterval(() => {
      step += 1
      const ease = 1 - Math.pow(1 - step / 12, 3)
      win.setSize(Math.round(currentWidth + (targetWidth - currentWidth) * ease), Math.round(currentHeight + (targetHeight - currentHeight) * ease))
      if (step < 12) return
      clearInterval(resizeTimer)
      resizeTimer = null
      controllerForWindow(win)?.applyModePolicy()
    }, 16)
  })
  ipcMain.on('window:dragStart', (event) => {
    const win = windowForEvent(event)
    if (!win) return
    dragStartMouse = screen.getCursorScreenPoint()
    dragStartWindow = win.getPosition()
    dragStartSize = win.getSize()
  })
  ipcMain.on('window:drag', (event) => {
    const win = windowForEvent(event)
    if (!win || !dragStartMouse || !dragStartWindow || !dragStartSize) return
    const point = screen.getCursorScreenPoint()
    win.setBounds({
      x: Math.round(dragStartWindow[0] + point.x - dragStartMouse.x),
      y: Math.round(dragStartWindow[1] + point.y - dragStartMouse.y),
      width: dragStartSize[0],
      height: dragStartSize[1]
    })
  })
}

module.exports = { registerWindowIpc }
