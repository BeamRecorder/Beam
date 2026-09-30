const path = require('node:path');
const { BrowserWindow } = require('electron');
const { enforceDefaultZoom, installBrowserZoomPolicy } = require('./browser-zoom-policy.cjs');
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PANEL_SIZES = {
  settings: { width: 720, height: 680, minWidth: 580, minHeight: 480 },
  projects: { width: 900, height: 640, minWidth: 660, minHeight: 440 },
  mascot: { width: 1280, height: 900, minWidth: 900, minHeight: 640 },
};
const PANEL_TITLES = { settings: 'Beam Settings', projects: 'Beam Projects', mascot: 'Beam Mascot Lab' };

function createHudPanelManager({
  applicationRoot,
  appIconPath,
  isPackaged,
  ipcMain,
  hudWindow,
  hudController,
  canAcceptWork,
}) {
  const panels = new Map();
  const owns = (sender, role) => panels.get(role)?.window.webContents === sender;
  const available = () => canAcceptWork() && !hudWindow.isDestroyed() && hudController.mode === 'hud';
  const present = (panel) => {
    if (!panel.nativeReady || !panel.rendererReady || panel.window.isDestroyed()) return;
    enforceDefaultZoom(panel.window.webContents);
    if (panel.window.isMinimized()) panel.window.restore();
    panel.window.show();
    panel.window.focus();
    clearTimeout(panel.timer);
    panel.resolve(true);
  };
  const open = (role, sender) => {
    if (sender !== hudWindow.webContents || !available()) throw new Error('The recorder is not available.');
    const existing = panels.get(role);
    if (existing && !existing.window.isDestroyed()) {
      present(existing);
      return existing.ready;
    }
    const window = new BrowserWindow({
      ...PANEL_SIZES[role],
      title: PANEL_TITLES[role],
      icon: appIconPath,
      show: false,
      transparent: false,
      backgroundColor: '#212123',
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#00000000', symbolColor: '#808080', height: 40 },
      ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 12, y: 12 } } : {}),
      thickFrame: true,
      resizable: true,
      hasShadow: true,
      webPreferences: {
        preload: path.join(applicationRoot, 'electron/preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        zoomFactor: 1,
      },
    });
    const panel = { window, nativeReady: false, rendererReady: false };
    panel.ready = new Promise((resolve, reject) => {
      panel.resolve = resolve;
      panel.reject = reject;
    });
    panels.set(role, panel);
    const fail = (error) => {
      panel.reject(error);
      if (!window.isDestroyed()) window.destroy();
    };
    panel.timer = setTimeout(() => fail(new Error('The window did not finish loading.')), 30_000);
    installBrowserZoomPolicy(window.webContents, { resetOnLoad: false });
    window.once('ready-to-show', () => {
      panel.nativeReady = true;
      present(panel);
    });
    window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame) fail(new Error(`Could not load the window (${code}): ${description}`));
    });
    window.webContents.on('render-process-gone', () => fail(new Error('The window renderer stopped.')));
    window.on('closed', () => {
      clearTimeout(panel.timer);
      panel.reject(new Error('The window was closed.'));
      if (panels.get(role) === panel) panels.delete(role);
    });
    const loading = isPackaged
      ? window.loadFile(path.join(applicationRoot, 'dist/hud-panel.html'), { query: { panel: role } })
      : window.loadURL(`http://localhost:6500/hud-panel.html?panel=${role}`);
    Promise.resolve(loading).catch(fail);
    return panel.ready;
  };

  ipcMain.handle('hud:open-settings', (event) => open('settings', event.sender));
  ipcMain.handle('hud:open-projects', (event) => open('projects', event.sender));
  ipcMain.handle('hud:open-mascot', (event) => open('mascot', event.sender));
  ipcMain.on('hud-panel:ready', (event) => {
    for (const panel of panels.values()) {
      if (panel.window.webContents !== event.sender) continue;
      panel.rendererReady = true;
      present(panel);
    }
  });
  ipcMain.handle('hud-panel:open-project', (event, request) => {
    if (!owns(event.sender, 'projects') || !available()) throw new Error('The project library is not available.');
    if (
      !request ||
      typeof request.id !== 'string' ||
      !PROJECT_ID.test(request.id) ||
      !['studio', 'instant', 'screenshot'].includes(request.mode)
    )
      throw new Error('Invalid project selection.');
    hudWindow.webContents.send('hud:open-project', { id: request.id, mode: request.mode });
    panels.get('projects').window.close();
    return true;
  });
  return {
    destroy() {
      for (const panel of panels.values()) {
        if (!panel.window.isDestroyed()) panel.window.destroy();
      }
      panels.clear();
    },
  };
}

module.exports = { createHudPanelManager };
