const { BrowserWindow } = require('electron');
const path = require('path');
const { installBrowserZoomPolicy } = require('./browser-zoom-policy.cjs');

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
  resolveSystemDark = () => initialDark,
  cleanupWindow = null,
  preferencesStore = null,
  appIconPath,
  screen = null,
  canAcceptWork = () => true,
}) {
  const sessions = new Map();
  let activeSession = null;
  let presentingSession = null;
  let recorderOrigin = null;
  let recorderContext = null;
  let recorderActive = false;
  let recorderRequestSequence = 0;
  let dark = initialDark;

  const overlayOptions = () => ({
    color: '#00000000',
    symbolColor: TITLEBAR_SYMBOL_COLOR,
    height: TITLEBAR_HEIGHT,
  });

  const resolveWindowDark = (session = null) => {
    const selectedTheme = preferencesStore?.read()?.theme;
    if (selectedTheme === 'dark') return true;
    if (selectedTheme === 'light') return false;
    if (selectedTheme === 'system') return Boolean(resolveSystemDark());
    return session?.dark ?? dark;
  };

  const load = (target) => {
    if (isPackaged) target.loadFile(path.join(applicationRoot, 'dist/editor.html'));
    else target.loadURL('http://localhost:6500/editor.html');
  };

  const sessionForSender = (sender) => {
    for (const session of sessions.values()) {
      if (session.window.webContents === sender) return session;
    }
    return null;
  };

  const isLive = (session) => Boolean(session && sessions.has(session.window) && !session.window.isDestroyed());

  const sendProgress = (session, stage) => {
    const value = EDITOR_LOADING_PROGRESS[stage];
    if (
      presentingSession !== session ||
      value === undefined ||
      value < session.lastProgressValue ||
      hudWindow.isDestroyed()
    )
      return false;
    session.lastProgressValue = value;
    hudWindow.webContents.send('editor:loading-progress', { stage, value });
    return true;
  };

  const sendContext = (session) => {
    if (!session.rendererReady || !isLive(session) || !session.currentProjectId) return;
    session.window.webContents.send('editor:context', { projectId: session.currentProjectId });
  };

  const hideHudBeforePresentingEditor = () => hudController.setVisible(false) === true && !hudWindow.isVisible();

  const presentHud = () => {
    if (hudWindow.isMinimized()) hudWindow.restore();
    hudController.showHud();
    hudController.setVisible?.(true);
    hudController.setHudInteractive?.(true);
    hudWindow.show();
    hudWindow.focus();
  };

  const clearRecorderOrigin = ({ notify = true, focus = false } = {}) => {
    const origin = recorderOrigin;
    recorderOrigin = null;
    recorderContext = null;
    recorderActive = false;
    if (notify && !hudWindow.isDestroyed()) hudWindow.webContents.send('editor:recorder-launcher', null);
    if (focus && isLive(origin)) {
      if (origin.window.isMinimized()) origin.window.restore();
      origin.window.show();
      origin.window.focus();
    }
    return origin;
  };

  const showHudForSession = (session) => {
    if (!canAcceptWork()) return false;
    if (isLive(session)) {
      session.returningToHud = true;
      session.window.close();
    }
    presentHud();
    return true;
  };

  const showHud = () => {
    if (!canAcceptWork()) return false;
    // Global entry points (tray, app activation, second instance) reveal the
    // HUD without owning any editor session. Only an editor-specific Back
    // action is allowed to close that editor.
    presentHud();
    return true;
  };

  const flushBounds = (session) => {
    if (session.persistTimer) clearTimeout(session.persistTimer);
    session.persistTimer = null;
    if (!preferencesStore || !isLive(session)) return;
    try {
      if (session.window.isMinimized()) return;
      const current = preferencesStore.read()?.extras?.editorWindow || {};
      if (session.window.isMaximized()) {
        preferencesStore.patch({ extras: { editorWindow: { ...current, isMaximized: true } } });
        return;
      }
      if (session.window.isFullScreen()) return;
      const { width, height } = session.window.getBounds();
      if (width >= EDITOR_MIN_SIZE.width && height >= EDITOR_MIN_SIZE.height) {
        preferencesStore.patch({ extras: { editorWindow: { ...current, width, height, isMaximized: false } } });
      }
    } catch {
      // Bounds persistence must never affect window lifecycle.
    }
  };

  const scheduleBoundsPersistence = (session) => {
    if (!preferencesStore || !isLive(session) || session.window.isMinimized() || session.window.isFullScreen()) return;
    if (session.persistTimer) clearTimeout(session.persistTimer);
    session.persistTimer = setTimeout(() => flushBounds(session), 200);
  };

  const cascadedPosition = (source, width, height) => {
    if (!isLive(source)) return {};
    const bounds = source.window.getBounds();
    const candidate = { x: bounds.x + 24, y: bounds.y + 24 };
    if (!screen) return candidate;
    const display = screen.getDisplayMatching?.(bounds) ?? screen.getDisplayNearestPoint?.(candidate);
    const area = display?.workArea;
    if (!area) return candidate;
    return {
      x: Math.min(Math.max(candidate.x, area.x), area.x + Math.max(0, area.width - width)),
      y: Math.min(Math.max(candidate.y, area.y), area.y + Math.max(0, area.height - height)),
    };
  };

  const createSession = (source = null) => {
    if (!canAcceptWork()) throw new Error('Cannot create an editor while Beam is shutting down');
    const savedWindow = preferencesStore?.read()?.extras?.editorWindow;
    const width =
      typeof savedWindow?.width === 'number' && savedWindow.width >= EDITOR_MIN_SIZE.width
        ? Math.round(savedWindow.width)
        : EDITOR_DEFAULT_SIZE.width;
    const height =
      typeof savedWindow?.height === 'number' && savedWindow.height >= EDITOR_MIN_SIZE.height
        ? Math.round(savedWindow.height)
        : EDITOR_DEFAULT_SIZE.height;
    const dark = resolveWindowDark(source);
    const window = new BrowserWindow({
      width,
      height,
      ...cascadedPosition(source, width, height),
      minWidth: EDITOR_MIN_SIZE.width,
      minHeight: EDITOR_MIN_SIZE.height,
      show: false,
      icon: appIconPath,
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
        zoomFactor: 1,
      },
    });
    installBrowserZoomPolicy(window.webContents);
    const session = {
      window,
      controller: null,
      currentProjectId: null,
      rendererReady: false,
      presented: false,
      returningToHud: false,
      dark,
      resolvePresentation: null,
      rejectPresentation: null,
      lastProgressValue: 0,
      persistTimer: null,
    };
    sessions.set(window, session);
    activeSession = session;
    if (savedWindow?.isMaximized) window.maximize();
    window.on('resize', () => scheduleBoundsPersistence(session));
    window.on('resized', () => flushBounds(session));
    window.on('maximize', () => flushBounds(session));
    window.on('unmaximize', () => flushBounds(session));
    window.on('focus', () => {
      activeSession = session;
    });
    window.on('close', () => flushBounds(session));
    session.controller = new EditorWindowController(window, () => showHudForSession(session));
    registerController(window, session.controller);

    const contents = window.webContents;
    if (!isPackaged) {
      contents.on('console-message', (details) => {
        if (details.message.startsWith('[Beam media:')) console.info(details.message);
      });
      contents.on('before-input-event', (event, input) => {
        if (
          input.type === 'keyDown' &&
          (input.key === 'F12' || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i'))
        ) {
          event.preventDefault();
          if (contents.isDevToolsOpened?.()) contents.closeDevTools?.();
          else contents.openDevTools?.({ mode: 'detach' });
        }
      });
    }
    contents.once('did-finish-load', () => {
      if (!isPackaged) contents.openDevTools?.({ mode: 'detach' });
      sendProgress(session, 'loadingEditor');
    });
    contents.once('destroyed', () => cleanupWindow?.(contents));
    window.on('closed', () => {
      const shouldQuit = !session.returningToHud;
      if (session.returningToHud) session.resolvePresentation?.(false);
      else session.rejectPresentation?.(new Error('La fenêtre éditeur a été fermée avant sa présentation'));
      session.resolvePresentation = null;
      session.rejectPresentation = null;
      sessions.delete(window);
      if (presentingSession === session) presentingSession = null;
      // Keep the recorder lock and launcher ownership until the HUD reports
      // that an active capture has stopped. Otherwise another live editor
      // could start a second recording while the first one is still running.
      if (recorderOrigin === session && !recorderActive) clearRecorderOrigin();
      if (activeSession === session) activeSession = [...sessions.values()].at(-1) ?? null;
      if (shouldQuit && sessions.size === 0 && !hudWindow.isDestroyed() && !hudWindow.isVisible()) hudWindow.close();
    });
    load(window);
    return session;
  };

  const open = (projectId, options = {}, sender = null) => {
    if (!canAcceptWork()) throw new Error('Cannot open an editor while Beam is shutting down');
    if (!PROJECT_ID.test(projectId)) throw new Error('Identifiant de projet invalide');
    if (options === null) options = {};
    if (typeof options !== 'object' || Array.isArray(options)) throw new Error("Options d'éditeur invalides");
    const disposition = options?.disposition ?? 'reuse';
    if (!['reuse', 'new-window'].includes(disposition)) throw new Error('Disposition de fenêtre éditeur invalide');
    const senderSession = sessionForSender(sender);
    if (sender && !senderSession && sender !== hudWindow.webContents)
      throw new Error('Fenêtre appelante non autorisée');
    const source = senderSession ?? recorderOrigin ?? activeSession;
    const session = disposition === 'new-window' ? createSession(source) : isLive(source) ? source : createSession();
    if (disposition === 'new-window' && recorderOrigin) clearRecorderOrigin();
    const supersededSession = presentingSession;
    if (supersededSession?.rejectPresentation) {
      supersededSession.rejectPresentation(new Error('La demande précédente a été remplacée'));
      supersededSession.resolvePresentation = null;
      supersededSession.rejectPresentation = null;
      if (supersededSession !== session && !supersededSession.presented && isLive(supersededSession)) {
        supersededSession.window.close();
      }
    }
    presentingSession = session;
    session.returningToHud = false;
    session.lastProgressValue = 0;
    session.currentProjectId = projectId;
    activeSession = session;
    sendProgress(session, 'openingWindow');
    hudController.setHudInteractive?.(true);
    if (session.rendererReady) {
      sendContext(session);
      if (session.window.isMinimized()) session.window.restore();
      if (!hideHudBeforePresentingEditor()) {
        throw new Error('La fenêtre HUD n’a pas pu être masquée avant la présentation de l’éditeur');
      }
      session.presented = true;
      session.window.show();
      session.window.focus();
      presentingSession = null;
      return Promise.resolve(true);
    }
    return new Promise((resolve, reject) => {
      session.resolvePresentation = resolve;
      session.rejectPresentation = reject;
    });
  };

  const markReady = (event) => {
    const session = sessionForSender(event.sender);
    if (!session) return false;
    session.rendererReady = true;
    if (presentingSession !== session || !session.resolvePresentation) return false;
    if (!hideHudBeforePresentingEditor()) {
      session.rejectPresentation?.(
        new Error('La fenêtre HUD n’a pas pu être masquée avant la présentation de l’éditeur'),
      );
      session.resolvePresentation = null;
      session.rejectPresentation = null;
      presentingSession = null;
      return false;
    }
    sendProgress(session, 'ready');
    session.presented = true;
    session.window.show();
    session.window.focus();
    session.resolvePresentation?.(true);
    session.resolvePresentation = null;
    session.rejectPresentation = null;
    presentingSession = null;
    return true;
  };

  const openRecorder = (event) => {
    if (!canAcceptWork()) return false;
    const origin = sessionForSender(event.sender);
    if (!origin || recorderActive || (recorderOrigin && recorderOrigin !== origin)) return false;
    if (!recorderOrigin) {
      recorderOrigin = origin;
      recorderContext = {
        requestId: `editor-recorder-${++recorderRequestSequence}`,
        preferredKind: 'window',
        // PipeWire's portal owns window selection on Linux; Electron's media
        // source id cannot identify the portal-selected stream there.
        preferredSourceId: process.platform === 'linux' ? null : (origin.window.getMediaSourceId?.() ?? null),
      };
    }
    hudWindow.webContents.send('editor:recorder-launcher', recorderContext);
    presentHud();
    return true;
  };

  const dismissRecorder = (event) => {
    if (event.sender !== hudWindow.webContents || !recorderOrigin) return false;
    const origin = clearRecorderOrigin();
    hudController.setVisible(false);
    const focusTarget = isLive(origin) ? origin : isLive(activeSession) ? activeSession : null;
    if (focusTarget) {
      if (focusTarget.window.isMinimized()) focusTarget.window.restore();
      focusTarget.window.show();
      focusTarget.window.focus();
    } else {
      presentHud();
    }
    return Boolean(origin);
  };

  const setTitlebarTheme = (event, isDark) => {
    const session = sessionForSender(event.sender);
    if (!session) return false;
    session.dark = Boolean(isDark);
    dark = session.dark;
    if (!isPackaged) console.info('[Beam editor theme] renderer theme remembered', { dark: session.dark });
    return true;
  };

  const reportLoadingStage = (event, stage) => {
    const session = sessionForSender(event.sender);
    return session ? sendProgress(session, stage) : false;
  };

  const setRecorderActive = (event, active) => {
    if (event.sender !== hudWindow.webContents) return false;
    recorderActive = Boolean(active);
    if (!recorderActive && recorderOrigin && !isLive(recorderOrigin)) clearRecorderOrigin();
    return true;
  };

  ipcMain.handle('editor:open', (event, projectId, options) => open(projectId, options, event.sender));
  ipcMain.handle('editor:open-recorder', openRecorder);
  ipcMain.handle('editor:dismiss-recorder', dismissRecorder);
  ipcMain.handle('editor:context', (event) => {
    const session = sessionForSender(event.sender);
    return session?.currentProjectId ? { projectId: session.currentProjectId } : null;
  });
  ipcMain.on('editor:ready', markReady);
  ipcMain.on('editor:loading-stage', reportLoadingStage);
  ipcMain.on('editor:titlebar-theme', setTitlebarTheme);
  ipcMain.on('editor:recorder-active', setRecorderActive);

  return {
    open: (projectId, options) => open(projectId, options),
    showHud,
    destroy: () => {
      clearRecorderOrigin({ notify: false });
      for (const session of [...sessions.values()]) {
        session.returningToHud = true;
        if (!session.window.isDestroyed()) session.window.destroy();
      }
      sessions.clear();
      activeSession = null;
      presentingSession = null;
    },
    window: () => (isLive(activeSession) ? activeSession.window : null),
    windows: () => [...sessions.keys()].filter((window) => !window.isDestroyed()),
  };
}

module.exports = {
  EDITOR_DEFAULT_SIZE,
  EDITOR_MIN_SIZE,
  TITLEBAR_HEIGHT,
  TITLEBAR_SYMBOL_COLOR,
  createEditorWindowManager,
};
