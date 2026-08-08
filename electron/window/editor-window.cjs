const { BrowserWindow } = require('electron');
const path = require('path');

const EDITOR_DEFAULT_SIZE = { width: 1280, height: 800 };
const EDITOR_MIN_SIZE = { width: 960, height: 600 };
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLEBAR_HEIGHT = 40;
const TITLEBAR_COLORS = {
  light: { color: '#ffffff', symbolColor: '#171717' },
  dark: { color: '#201f1c', symbolColor: '#f7f5f0' },
};

class EditorWindowController {
  constructor(window, showHud) {
    this.window = window;
    this.showHudWindow = showHud;
  }

  showHud() {
    this.showHudWindow();
  }

  setVisible(visible) {
    if (visible) {
      if (this.window.isMinimized()) this.window.restore();
      this.window.show();
      this.window.focus();
    } else this.window.hide();
  }

  setHudInteractive() {}
  applyModePolicy() {}
}

function createEditorWindowManager({
  applicationRoot,
  isPackaged,
  ipcMain,
  hudWindow,
  hudController,
  registerController,
  initialDark = false,
  cleanupWindow = null,
}) {
  let window = null;
  let controller = null;
  let currentProjectId = null;
  let rendererReady = false;
  let returningToHud = false;
  let dark = initialDark;
  let resolvePresentation = null;
  let rejectPresentation = null;

  const overlayOptions = () => ({ ...TITLEBAR_COLORS[dark ? 'dark' : 'light'], height: TITLEBAR_HEIGHT });

  const load = (target) => {
    if (isPackaged) target.loadFile(path.join(applicationRoot, 'dist/editor.html'));
    else target.loadURL('http://localhost:6500/editor.html');
  };

  const sendContext = () => {
    if (!rendererReady || !window || window.isDestroyed() || !currentProjectId) return;
    window.webContents.send('editor:context', { projectId: currentProjectId });
  };

  const showHud = () => {
    returningToHud = true;
    if (window && !window.isDestroyed()) window.close();
    if (hudWindow.isMinimized()) hudWindow.restore();
    hudController.showHud();
    hudWindow.show();
    hudWindow.focus();
  };

  const ensure = () => {
    if (window && !window.isDestroyed()) return window;
    rendererReady = false;
    returningToHud = false;
    window = new BrowserWindow({
      ...EDITOR_DEFAULT_SIZE,
      minWidth: EDITOR_MIN_SIZE.width,
      minHeight: EDITOR_MIN_SIZE.height,
      show: false,
      frame: true,
      transparent: false,
      backgroundColor: dark ? '#141310' : '#f7f5f0',
      titleBarStyle: 'hidden',
      titleBarOverlay: process.platform === 'darwin' ? true : overlayOptions(),
      ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 12, y: 12 } } : {}),
      thickFrame: true,
      hasShadow: true,
      resizable: true,
      maximizable: true,
      minimizable: true,
      movable: true,
      webPreferences: {
        preload: path.join(applicationRoot, 'electron/preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webSecurity: false,
      },
    });
    controller = new EditorWindowController(window, showHud);
    registerController(window, controller);
    const contents = window.webContents;
    contents.once('destroyed', () => cleanupWindow?.(contents));
    window.on('closed', () => {
      const shouldQuit = !returningToHud;
      if (returningToHud) resolvePresentation?.(false);
      else rejectPresentation?.(new Error('La fenêtre éditeur a été fermée avant sa présentation'));
      resolvePresentation = null;
      rejectPresentation = null;
      window = null;
      controller = null;
      rendererReady = false;
      if (shouldQuit && !hudWindow.isDestroyed()) hudWindow.close();
    });
    load(window);
    return window;
  };

  const open = (projectId) => {
    if (!PROJECT_ID.test(projectId)) throw new Error('Identifiant de projet invalide');
    currentProjectId = projectId;
    const target = ensure();
    if (rendererReady) {
      sendContext();
      if (target.isMinimized()) target.restore();
      target.show();
      target.focus();
      hudWindow.hide();
      return Promise.resolve(true);
    }
    if (rejectPresentation) rejectPresentation(new Error('La demande précédente a été remplacée'));
    return new Promise((resolve, reject) => {
      resolvePresentation = resolve;
      rejectPresentation = reject;
    });
  };

  const markReady = (event) => {
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return false;
    rendererReady = true;
    window.show();
    window.focus();
    hudWindow.hide();
    resolvePresentation?.(true);
    resolvePresentation = null;
    rejectPresentation = null;
    return true;
  };

  const startRecording = (event, configuration) => {
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return false;
    returningToHud = true;
    window.close();
    hudWindow.webContents.send('editor:start-recording', configuration);
    return true;
  };

  const setTitlebarTheme = (event, isDark) => {
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return false;
    dark = Boolean(isDark);
    window.setBackgroundColor(dark ? '#141310' : '#f7f5f0');
    if (process.platform !== 'darwin') window.setTitleBarOverlay(overlayOptions());
    return true;
  };

  ipcMain.handle('editor:open', (_event, projectId) => open(projectId));
  ipcMain.handle('editor:context', (event) =>
    window && !window.isDestroyed() && event.sender === window.webContents && currentProjectId
      ? { projectId: currentProjectId }
      : null,
  );
  ipcMain.on('editor:ready', markReady);
  ipcMain.on('editor:start-recording', startRecording);
  ipcMain.on('editor:titlebar-theme', setTitlebarTheme);

  return {
    open,
    showHud,
    destroy: () => {
      returningToHud = true;
      if (window && !window.isDestroyed()) window.destroy();
      window = null;
    },
    window: () => window,
  };
}

module.exports = {
  EDITOR_DEFAULT_SIZE,
  EDITOR_MIN_SIZE,
  TITLEBAR_HEIGHT,
  createEditorWindowManager,
};
