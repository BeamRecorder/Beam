const { BrowserWindow } = require('electron');

function windowForEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function registerWindowIpc(ipcMain, controllerForWindow, { debug = false } = {}) {
  const logWindow = (message, details) => {
    if (!debug) return;
    if (details === undefined) console.log(`[electron window] ${message}`);
    else console.log(`[electron window] ${message}`, details);
  };
  let resizeTimer = null;

  ipcMain.on('window:close', (event) => windowForEvent(event)?.close());
  ipcMain.on('window:minimize', (event) => windowForEvent(event)?.minimize());
  ipcMain.on('window:toggle-devtools', (event) => {
    const win = windowForEvent(event);
    if (!win || win.isDestroyed()) return;
    if (win.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools();
    } else {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });
  ipcMain.on('window:set-mode', (event, mode) => {
    logWindow('set-mode', mode);
    controllerForWindow(windowForEvent(event))?.setMode?.(mode);
  });
  ipcMain.on('window:show-hud', (event) => controllerForWindow(windowForEvent(event))?.showHud());
  ipcMain.on('window:setPosition', (event, x, y) => {
    const win = windowForEvent(event);
    win?.setPosition(Math.round(x), Math.round(y));
    controllerForWindow(win)?.rememberRecorderPosition();
  });
  ipcMain.on('window:setSize', (event, width, height) => {
    const win = windowForEvent(event);
    if (!win) return;
    const targetWidth = Math.round(width);
    const targetHeight = Math.round(height);
    if (win.webContents.getURL().includes('cameraOverlay')) {
      const [x, y] = win.getPosition();
      return win.setBounds({ x, y, width: targetWidth, height: targetHeight });
    }
    win.setSize(targetWidth, targetHeight);
  });
  ipcMain.on('window:setInteractive', (event, overInteractive) =>
    controllerForWindow(windowForEvent(event))?.setHudInteractive(overInteractive),
  );
  ipcMain.on('window:recorder-drag-start', (event) => {
    controllerForWindow(windowForEvent(event))?.beginRecorderDrag();
    event.returnValue = true;
  });
  ipcMain.on('window:set-visible', (event, visible) => {
    logWindow('set-visible', Boolean(visible));
    controllerForWindow(windowForEvent(event))?.setVisible(Boolean(visible));
  });
  ipcMain.handle('window:set-recorder-tooltip', (event, visible) => {
    return controllerForWindow(windowForEvent(event))?.setRecorderTooltip(Boolean(visible)) ?? null;
  });
  ipcMain.handle('window:get-recorder-tooltip-side', (event) => {
    return controllerForWindow(windowForEvent(event))?.getRecorderTooltipSide() ?? null;
  });
  ipcMain.handle('window:bounds', (event) => windowForEvent(event)?.getBounds() ?? null);

  ipcMain.on('window:setSizeSmooth', (event, width, height) => {
    const win = windowForEvent(event);
    if (!win) return;
    if (resizeTimer) clearInterval(resizeTimer);
    const [currentWidth, currentHeight] = win.getSize();
    const targetWidth = Math.round(width);
    const targetHeight = Math.round(height);
    if (Math.abs(currentHeight - targetHeight) < 5) return win.setSize(targetWidth, targetHeight);
    let step = 0;
    win.setResizable(true);
    resizeTimer = setInterval(() => {
      step += 1;
      const ease = 1 - Math.pow(1 - step / 12, 3);
      win.setSize(
        Math.round(currentWidth + (targetWidth - currentWidth) * ease),
        Math.round(currentHeight + (targetHeight - currentHeight) * ease),
      );
      if (step < 12) return;
      clearInterval(resizeTimer);
      resizeTimer = null;
      controllerForWindow(win)?.applyModePolicy();
    }, 16);
  });
}

module.exports = { registerWindowIpc };
