const { BrowserWindow, screen } = require('electron')

function windowForEvent(event) {
  return BrowserWindow.fromWebContents(event.sender)
}

function clampToDisplayBounds(x, y, width, height, point, geometry = { width, leftOffset: 0 }) {
  // Use physical display bounds instead of workArea so the Windows taskbar
  // does not become an artificial wall while dragging.
  const displayBounds = screen.getDisplayNearestPoint(point).bounds
  const minX = displayBounds.x - geometry.leftOffset
  const maxX = displayBounds.x + Math.max(0, displayBounds.width - geometry.width) - geometry.leftOffset
  const maxY = displayBounds.y + Math.max(0, displayBounds.height - height)
  return {
    x: Math.min(Math.max(Math.round(x), minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(Math.round(y), displayBounds.y), maxY),
  }
}

function registerWindowIpc(ipcMain, controllerForWindow) {
  let resizeTimer = null
  let dragStartMouse = null
  let dragStartWindow = null
  let dragStartSize = null
  let dragStartGeometry = null
  let dragTimer = null

  const clearDragState = () => {
    if (dragTimer) clearInterval(dragTimer)
    dragTimer = null
    dragStartMouse = null
    dragStartWindow = null
    dragStartSize = null
    dragStartGeometry = null
  }

  const updateDragPosition = (win) => {
    if (!win || win.isDestroyed()) {
      clearDragState()
      return
    }
    if (!dragStartMouse || !dragStartWindow || !dragStartSize) return
    const point = screen.getCursorScreenPoint()
    const geometry = dragStartGeometry || { width: dragStartSize[0], leftOffset: 0 }
    const position = clampToDisplayBounds(
      dragStartWindow[0] + point.x - dragStartMouse.x,
      dragStartWindow[1] + point.y - dragStartMouse.y,
      dragStartSize[0],
      dragStartSize[1],
      point,
      geometry,
    )
    // Dragging must only move the native window. Reapplying full bounds on
    // every pointer update can make Chromium/Electron recalculate the size
    // of transparent HUD windows, especially across DPI/display boundaries.
    win.setPosition(position.x, position.y)
    controllerForWindow(win)?.rememberRecorderPosition()
  }

  ipcMain.on('window:close', (event) => windowForEvent(event)?.close())
  ipcMain.on('window:minimize', (event) => windowForEvent(event)?.minimize())
  ipcMain.on('window:set-mode', (event, mode) => controllerForWindow(windowForEvent(event))?.setMode(mode))
  ipcMain.on('window:maximize', (event) => controllerForWindow(windowForEvent(event))?.maximize())
  ipcMain.on('window:unmaximize', (event) => controllerForWindow(windowForEvent(event))?.restore())
  ipcMain.on('window:toggleMaximize', (event) => controllerForWindow(windowForEvent(event))?.toggleMaximize())
  ipcMain.on('window:present', (event) => controllerForWindow(windowForEvent(event))?.present())
  ipcMain.on('window:show-hud', (event) => controllerForWindow(windowForEvent(event))?.showHud())
  ipcMain.on('window:setPosition', (event, x, y) => { const win = windowForEvent(event); win?.setPosition(Math.round(x), Math.round(y)); controllerForWindow(win)?.rememberRecorderPosition() })
  ipcMain.on('window:setSize', (event, width, height) => {
    const win = windowForEvent(event)
    if (!win) return
    const targetWidth = Math.round(width)
    const targetHeight = Math.round(height)
    if (win.webContents.getURL().includes('cameraOverlay')) {
      const [x, y] = win.getPosition()
      return win.setBounds({ x, y, width: targetWidth, height: targetHeight })
    }
    win.setSize(targetWidth, targetHeight)
  })
  ipcMain.on('window:setInteractive', (event, overInteractive) => controllerForWindow(windowForEvent(event))?.setHudInteractive(overInteractive))
  ipcMain.on('window:set-visible', (event, visible) => controllerForWindow(windowForEvent(event))?.setVisible(Boolean(visible)))
  ipcMain.handle('window:set-recorder-tooltip', (event, visible) => {
    return controllerForWindow(windowForEvent(event))?.setRecorderTooltip(Boolean(visible)) ?? null
  })
  ipcMain.handle('window:bounds', (event) => windowForEvent(event)?.getBounds() ?? null)

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
    const controller = controllerForWindow(win)
    controller?.setRecorderTooltip(false)
    clearDragState()
    dragStartMouse = screen.getCursorScreenPoint()
    dragStartWindow = win.getPosition()
    dragStartSize = win.getSize()
    dragStartGeometry = controller?.dragGeometry?.(dragStartSize) || { width: dragStartSize[0], leftOffset: 0 }
    dragTimer = setInterval(() => updateDragPosition(win), 16)
  })
  ipcMain.on('window:drag', (event) => {
    const win = windowForEvent(event)
    updateDragPosition(win)
  })
  ipcMain.handle('window:dragEnd', (event) => {
    const win = windowForEvent(event)
    const controller = controllerForWindow(win)
    clearDragState()
    controller?.flushRecorderPosition()
    return controller?.setRecorderTooltip(true) ?? null
  })
}

module.exports = { registerWindowIpc }
