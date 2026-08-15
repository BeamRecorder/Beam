const { BrowserWindow } = require('electron');
const path = require('path');

const EDITOR_DEFAULT_SIZE = { width: 1280, height: 800 };
const EDITOR_MIN_SIZE = { width: 960, height: 600 };
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLEBAR_HEIGHT = 40;
const TITLEBAR_SYMBOL_COLOR = '#7a7a7a';
const EDITOR_LOADING_PROGRESS = Object.freeze({
  openingWindow: 10,
  loadingEditor: 25,
  loadingProject: 45,
  loadingTimeline: 65,
  renderingEditor: 90,
  ready: 100,
});

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
  preferencesStore = null,
  canAcceptWork = () => true,
}) {
  let window = null;
  let controller = null;
  let currentProjectId = null;
  let rendererReady = false;
  let returningToHud = false;
  let dark = initialDark;
  let resolvePresentation = null;
  let rejectPresentation = null;
  let lastProgressValue = 0;
  let persistTimer = null;

  const flushBounds = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    if (!preferencesStore || !window || window.isDestroyed()) return;
    try {
      if (window.isMaximized() || window.isMinimized() || window.isFullScreen()) return;
      const bounds = window.getBounds();
      const width = Math.round(bounds.width);
      const height = Math.round(bounds.height);
      if (width >= EDITOR_MIN_SIZE.width && height >= EDITOR_MIN_SIZE.height) {
        preferencesStore.patch({ extras: { editorWindow: { width, height } } });
      }
    } catch {
      // Window persistence is best effort and must not affect the window.
    }
  };

  const scheduleBoundsPersistence = () => {
    if (!preferencesStore || !window || window.isDestroyed()) return;
    if (window.isMaximized() || window.isMinimized() || window.isFullScreen()) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      flushBounds();
    }, 200);
  };

  // WCO defaults to the Windows system color when color is omitted. Keep its
  // compositor layer transparent so the editor titlebar remains the only
  // painted surface in both application themes. The neutral symbols remain
  // visible without a risky runtime setTitleBarOverlay() call.
  const overlayOptions = () => ({
    color: '#00000000',
    symbolColor: TITLEBAR_SYMBOL_COLOR,
    height: TITLEBAR_HEIGHT,
  });

  const sendProgress = (stage) => {
    const value = EDITOR_LOADING_PROGRESS[stage];
    if (value === undefined || value < lastProgressValue || hudWindow.isDestroyed()) return false;
    lastProgressValue = value;
    hudWindow.webContents.send('editor:loading-progress', { stage, value });
    return true;
  };

  const load = (target) => {
    if (isPackaged) target.loadFile(path.join(applicationRoot, 'dist/editor.html'));
    else target.loadURL('http://localhost:6500/editor.html');
  };

  const sendContext = () => {
    if (!rendererReady || !window || window.isDestroyed() || !currentProjectId) return;
    window.webContents.send('editor:context', { projectId: currentProjectId });
  };

  const showHud = () => {
    if (!canAcceptWork()) return false;
    returningToHud = true;
    if (window && !window.isDestroyed()) window.close();
    if (hudWindow.isMinimized()) hudWindow.restore();
    hudController.showHud();
    hudWindow.show();
    hudWindow.focus();
    return true;
  };

  const ensure = () => {
    if (!canAcceptWork()) throw new Error('Cannot create an editor while Beam is shutting down');
    if (window && !window.isDestroyed()) return window;
    rendererReady = false;
    returningToHud = false;
    const savedWindow = preferencesStore?.read()?.extras?.editorWindow;
    const initialWidth =
      typeof savedWindow?.width === 'number' && savedWindow.width >= EDITOR_MIN_SIZE.width
        ? Math.round(savedWindow.width)
        : EDITOR_DEFAULT_SIZE.width;
    const initialHeight =
      typeof savedWindow?.height === 'number' && savedWindow.height >= EDITOR_MIN_SIZE.height
        ? Math.round(savedWindow.height)
        : EDITOR_DEFAULT_SIZE.height;
    window = new BrowserWindow({
      width: initialWidth,
      height: initialHeight,
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
    window.on('resize', scheduleBoundsPersistence);
    window.on('resized', () => {
      scheduleBoundsPersistence();
      flushBounds();
    });
    window.on('close', flushBounds);
    controller = new EditorWindowController(window, showHud);
    registerController(window, controller);
    const contents = window.webContents;
    if (!isPackaged) {
      contents.on('console-message', (details) => {
        if (details.message.startsWith('[Beam media:')) console.info(details.message);
      });
      contents.on('before-input-event', (event, input) => {
        if (
          input.type === 'keyDown' &&
          (input.key === 'F12' ||
            ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i'))
        ) {
          event.preventDefault();
          if (contents.isDevToolsOpened?.()) {
            contents.closeDevTools?.();
          } else {
            contents.openDevTools?.({ mode: 'detach' });
          }
        }
      });
    }
    contents.once('did-finish-load', () => {
      if (!isPackaged) contents.openDevTools?.({ mode: 'detach' });
      sendProgress('loadingEditor');
    });
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
    if (!canAcceptWork()) throw new Error('Cannot open an editor while Beam is shutting down');
    if (!PROJECT_ID.test(projectId)) throw new Error('Identifiant de projet invalide');
    lastProgressValue = 0;
    sendProgress('openingWindow');
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
    sendProgress('ready');
    window.show();
    window.focus();
    hudWindow.hide();
    resolvePresentation?.(true);
    resolvePresentation = null;
    rejectPresentation = null;
    return true;
  };

  const startRecording = (event, configuration) => {
    if (!canAcceptWork()) return false;
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return false;
    returningToHud = true;
    window.close();
    hudWindow.webContents.send('editor:start-recording', configuration);
    return true;
  };

  const setTitlebarTheme = (event, isDark) => {
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return false;
    dark = Boolean(isDark);
    // Theme switching belongs to the renderer. Mutating nativeTheme,
    // BrowserWindow.backgroundColor, or WCO while this window is visible can
    // replace the live compositor surface with a blank layer on Windows.
    // Remember the value only so a future editor window starts with the right
    // fallback background before its first renderer paint.
    if (!isPackaged) console.info('[Beam editor theme] renderer theme remembered', { dark });
    return true;
  };

  const reportLoadingStage = (event, stage) => {
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return false;
    return sendProgress(stage);
  };

  ipcMain.handle('editor:open', (_event, projectId) => open(projectId));
  ipcMain.handle('editor:context', (event) =>
    window && !window.isDestroyed() && event.sender === window.webContents && currentProjectId
      ? { projectId: currentProjectId }
      : null,
  );
  ipcMain.on('editor:ready', markReady);
  ipcMain.on('editor:loading-stage', reportLoadingStage);
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
  TITLEBAR_SYMBOL_COLOR,
  createEditorWindowManager,
};
