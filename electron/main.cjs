const {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  session,
  protocol,
  globalShortcut,
  screen,
  net,
  shell,
  nativeTheme,
  powerMonitor,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { Readable } = require('stream');
const { CaptureEngine } = require('./capture/capture-engine.cjs');
const { registerCaptureIpc } = require('./capture/capture-ipc.cjs');
const { registerProjectIpc } = require('./projects/project-ipc.cjs');
const { createProjectStore } = require('./projects/project-store.cjs');
const { WindowController } = require('./window/window-controller.cjs');
const { registerWindowIpc } = require('./window/window-ipc.cjs');
const { shouldAutoOpenDevTools } = require('./window/devtools-policy.cjs');
const { createEditorWindowManager } = require('./window/editor-window.cjs');
const { registerExportIpc } = require('./export/export-ipc.cjs');
const { createCameraOverlayWindow } = require('./camera/overlay-window.cjs');
const { createCountdownWindow } = require('./countdown-window.cjs');
const { createScreenRegionOverlayWindow } = require('./screen-region-overlay.cjs');
const { createCameraStorage, registerCameraIpc } = require('./camera-ipc.cjs');
const { createMicrophoneStorage, registerMicrophoneIpc } = require('./microphone/ipc.cjs');
const { createSystemAudioStorage, registerSystemAudioIpc } = require('./system-audio/ipc.cjs');
const { createWhisperModelStore } = require('./captions/whisper-model-store.cjs');
const { registerWhisperIpc } = require('./captions/whisper-ipc.cjs');
const { createPreferencesStore } = require('./preferences/preferences-store.cjs');
const { registerPreferencesIpc } = require('./preferences/preferences-ipc.cjs');
const { createTeleprompterWindow } = require('./teleprompter/teleprompter-window.cjs');
const { registerTeleprompterIpc } = require('./teleprompter/teleprompter-ipc.cjs');
const { createTeleprompterStorage } = require('./teleprompter/teleprompter-storage.cjs');
const { createUserPaths } = require('./storage/user-paths.cjs');
const { createBackgroundLibrary } = require('./backgrounds/background-library.cjs');
const { createAutoUpdater, registerUpdateIpc } = require('./updates/auto-updater.cjs');
const { createTrayManager } = require('./tray/tray-manager.cjs');
const { InputAccess, registerInputAccessIpc } = require('./input/input-access.cjs');
const { createShutdownCoordinator } = require('./lifecycle/shutdown-coordinator.cjs');
const { createShutdownAwareIpc } = require('./lifecycle/shutdown-ipc.cjs');
const { registerFatalLifecycle } = require('./lifecycle/fatal-events.cjs');
const { initializeSingleInstance } = require('./lifecycle/single-instance.cjs');

const DISCORD_INVITE_URL = 'https://discord.gg/6Q6v2xUCB';
const GITHUB_REPOSITORY_URL = 'https://github.com/ExtraBinoss/Beam';

// Set to true only while diagnosing Electron startup or renderer requests.
const ENABLE_ELECTRON_DIAGNOSTIC_LOGS = !app.isPackaged;

protocol.registerSchemesAsPrivileged([
  { scheme: 'whisper-model', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'project-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const startupAt = process.hrtime.bigint();
const logStartup = (step) => {
  if (!ENABLE_ELECTRON_DIAGNOSTIC_LOGS || app.isPackaged) return;
  const elapsedMs = Number(process.hrtime.bigint() - startupAt) / 1_000_000;
  console.log(`[electron +${elapsedMs.toFixed(0)} ms] ${step}`);
};

const applicationRoot = path.join(__dirname, '..');
const controllers = new WeakMap();
let captureEngine = null;
let coordinator = null;
let quitting = false;
let showExistingHud = () => false;
let pendingHudRestore = false;

function restoreCanonicalHud() {
  if (showExistingHud()) pendingHudRestore = false;
  else pendingHudRestore = true;
}

function profileRendererRequests(webContents) {
  if (app.isPackaged) return;
  const requests = new Map();
  const session = webContents.session;
  session.webRequest.onBeforeRequest({ urls: ['http://localhost:6500/*'] }, (details, callback) => {
    requests.set(details.id, { startedAt: performance.now(), url: details.url });
    callback({});
  });
  session.webRequest.onCompleted({ urls: ['http://localhost:6500/*'] }, (details) => {
    const request = requests.get(details.id);
    if (!request) return;
    requests.delete(details.id);
    const elapsedMs = performance.now() - request.startedAt;
    if (elapsedMs >= 100)
      logStartup(`Renderer request ${details.statusCode} in ${elapsedMs.toFixed(0)} ms: ${request.url}`);
  });
  session.webRequest.onErrorOccurred({ urls: ['http://localhost:6500/*'] }, (details) => {
    const request = requests.get(details.id);
    requests.delete(details.id);
    logStartup(`Renderer request failed (${details.error}): ${request?.url || details.url}`);
  });
}

function isTrustedRenderer(url) {
  if (url.startsWith('file://')) return true;
  try {
    const target = new URL(url);
    return (
      target.origin === 'http://localhost:6500' && ['/', '/editor.html', '/teleprompter.html'].includes(target.pathname)
    );
  } catch {
    return false;
  }
}

function configureMediaPermission() {
  const trusted = (webContents) => Boolean(webContents) && isTrustedRenderer(webContents.getURL());
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission) => trusted(webContents) && (permission === 'media' || permission === 'display-capture'),
  );
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (!trusted(webContents)) return callback(false);
    callback(permission === 'media' || permission === 'display-capture');
  });
}

function configureDesktopLoopback() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      if (!app.isPackaged)
        logStartup(
          `Desktop loopback request received (${sources.length} screen source${sources.length === 1 ? '' : 's'}).`,
        );
      callback(sources[0] ? { video: sources[0], audio: 'loopback' } : {});
    } catch {
      if (!app.isPackaged) logStartup('Desktop loopback source discovery failed.');
      callback({});
    }
  });
}

function getAppIconPath() {
  const candidates = [
    path.join(applicationRoot, 'dist/brand/BeamIcon.ico'),
    path.join(applicationRoot, 'public/brand/BeamIcon.ico'),
    path.join(__dirname, '../dist/brand/BeamIcon.ico'),
    path.join(__dirname, '../public/brand/BeamIcon.ico'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(applicationRoot, 'public/brand/BeamIcon.ico');
}

function createWindow(preferencesStore) {
  logStartup('Creating BrowserWindow.');
  const win = new BrowserWindow({
    width: 352,
    height: 512,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    icon: getAppIconPath(),
    resizable: true,
    maximizable: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
    },
  });
  const controller = new WindowController(win, { preferencesStore });
  controllers.set(win, controller);
  // use profileRendererRequests() to see all the requests made by the app and find out why it's slow to launch.
  // profileRendererRequests(win.webContents)
  win.once('ready-to-show', () => {
    logStartup('Window is ready to show (ready-to-show).');
    controller.markReadyToShow();
  });
  win.webContents.once('did-start-loading', () => logStartup('Renderer navigation started.'));
  win.webContents.once('dom-ready', () => logStartup('Renderer DOM is ready.'));
  win.webContents.once('did-finish-load', () => logStartup('Renderer loading finished.'));
  if (shouldAutoOpenDevTools({ isPackaged: app.isPackaged })) {
    win.webContents.once('did-finish-load', () => win.webContents.openDevTools({ mode: 'detach' }));
  }
  if (app.isPackaged) {
    logStartup('Loading dist/index.html.');
    win.loadFile(path.join(applicationRoot, 'dist/index.html'));
  } else {
    logStartup('Loading http://localhost:6500.');
    win.loadURL('http://localhost:6500');
  }
  return win;
}

function initializeApplication() {
  const inputAccess = new InputAccess({
    app,
    applicationRoot,
    nativeRequest: (command) => captureEngine.request(command),
  });
  captureEngine = new CaptureEngine(app, applicationRoot, {
    inputHelperPath: () => inputAccess.helperForCapture(),
  });
  coordinator = createShutdownCoordinator({ captureEngine, log: logStartup });
  const applicationIpc = createShutdownAwareIpc(ipcMain, () => coordinator.canAcceptWork());
  registerFatalLifecycle({ app, powerMonitor, coordinator, log: logStartup });
  const cameraStorage = createCameraStorage({});
  const microphoneStorage = createMicrophoneStorage({});
  const systemAudioStorage = createSystemAudioStorage({});

  app.whenReady().then(() => {
    logStartup('Electron app.whenReady resolved.');
    configureMediaPermission();
    logStartup('Media permission policy registered.');
    configureDesktopLoopback();
    registerInputAccessIpc(applicationIpc, inputAccess);
    const userPaths = createUserPaths(app.getPath('videos'));
    const preferencesStore = createPreferencesStore(userPaths.preferences, { platform: process.platform });
    const teleprompterWindow = createTeleprompterWindow({
      applicationRoot,
      isPackaged: app.isPackaged,
      preferencesStore,
    });
    setTimeout(() => teleprompterWindow.prepare(), 0);
    const preferencesCleanup = registerPreferencesIpc({
      ipcMain: applicationIpc,
      BrowserWindow,
      globalShortcut,
      store: preferencesStore,
      shortcutHandler: (id) => teleprompterWindow.handleShortcut(id),
      onPreferencesChanged: (preferences) => {
        for (const win of BrowserWindow.getAllWindows()) {
          const controller = controllers.get(win);
          if (controller) {
            controller.applyModePolicy();
          }
        }
      },
    });
    logStartup('Desktop loopback policy registered.');
    registerCaptureIpc({
      ipcMain,
      desktopCapturer,
      screen,
      captureEngine,
      app,
      userPaths,
      trackStorages: [cameraStorage, microphoneStorage, systemAudioStorage],
      canAcceptWork: () => coordinator.canAcceptWork(),
    });
    logStartup('Capture IPC registered.');
    registerCameraIpc({ ipcMain: applicationIpc, storage: cameraStorage });
    registerMicrophoneIpc({ ipcMain: applicationIpc, storage: microphoneStorage });
    registerSystemAudioIpc({ ipcMain: applicationIpc, storage: systemAudioStorage });
    logStartup('Capture track IPC registered.');
    const projectStore = createProjectStore(userPaths.projects);
    const teleprompterStorage = createTeleprompterStorage({ projectStore });
    registerTeleprompterIpc({ ipcMain: applicationIpc, teleprompterWindow, storage: teleprompterStorage });
    registerProjectIpc(
      applicationIpc,
      projectStore,
      createBackgroundLibrary(userPaths),
      require('electron').dialog,
      BrowserWindow,
    );
    protocol.handle('project-media', async (request) => {
      try {
        const file = projectStore.mediaFileForUrl(request.url);
        if (!file || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
        const response = await net.fetch(pathToFileURL(file).href);
        const ext = path.extname(file).toLowerCase();
        const mimeTypes = {
          '.mp4': 'video/mp4',
          '.webm': 'video/webm',
          '.mov': 'video/quicktime',
          '.mkv': 'video/x-matroska',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.webp': 'image/webp',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const headers = new Headers(response.headers);
        headers.set('content-type', contentType);
        headers.set('access-control-allow-origin', '*');
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch (e) {
        console.error('[project-media] Error serving media:', e);
        return new Response('Internal error', { status: 500 });
      }
    });
    logStartup('Project IPC registered.');
    const whisperStore = createWhisperModelStore(userPaths.whisperModels);
    protocol.handle('whisper-model', (request) => {
      const file = whisperStore.fileForUrl(request.url);
      return file
        ? new Response(Readable.toWeb(fs.createReadStream(file)), {
            headers: { 'Content-Length': String(fs.statSync(file).size) },
          })
        : new Response('Not found', { status: 404 });
    });
    registerWhisperIpc({ ipcMain: applicationIpc, store: whisperStore });
    logStartup('Whisper model IPC registered.');
    registerWindowIpc(applicationIpc, (win) => win && controllers.get(win), { debug: !app.isPackaged });
    const lifecycleOptions = {
      applicationRoot,
      isPackaged: app.isPackaged,
      canAcceptWork: () => coordinator.canAcceptWork(),
    };
    const cameraOverlay = createCameraOverlayWindow(lifecycleOptions);
    const countdownOverlay = createCountdownWindow(lifecycleOptions);
    const screenRegionOverlay = createScreenRegionOverlayWindow(lifecycleOptions);
    applicationIpc.on('camera-overlay:configure', (_event, state) => cameraOverlay.configure(state));
    applicationIpc.on('camera-overlay:set-active', (_event, active) => cameraOverlay.setActive(active));
    applicationIpc.on('camera-overlay:reset-placement', () => cameraOverlay.resetPlacement());
    applicationIpc.handle('countdown:set', (_event, seconds) => {
      countdownOverlay.show(Number.isInteger(seconds) && seconds >= 0 ? seconds : null);
    });
    applicationIpc.handle('recording-surface:prepare', async () => {
      countdownOverlay.show(null);
      screenRegionOverlay.hide();
      // Wait for the compositor to commit both hidden overlay surfaces before
      // the native start gate admits the first recorded frame.
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    applicationIpc.handle('screen-region:select', (_event, options) => screenRegionOverlay.select(options));
    applicationIpc.on('screen-region:show', (_event, options) => screenRegionOverlay.show(options));
    applicationIpc.on('screen-region:hide', () => screenRegionOverlay.hide());
    applicationIpc.on('screen-region:confirm', (_event, region) => screenRegionOverlay.confirm(region));
    applicationIpc.on('screen-region:cancel', () => screenRegionOverlay.cancel());
    applicationIpc.handle('camera-overlay:state', () => cameraOverlay.state());
    logStartup('Window IPC registered.');
    const exportIpc = registerExportIpc({ ipcMain: applicationIpc, dialog: require('electron').dialog, BrowserWindow });
    logStartup('Export IPC registered.');
    const updater = createAutoUpdater({
      app,
      BrowserWindow,
      autoUpdater,
      openExternal: require('electron').shell.openExternal,
      beforeQuitAndInstall: () => coordinator.requestShutdown('updater'),
    });
    registerUpdateIpc(applicationIpc, updater);
    applicationIpc.handle('community:open-discord', () => shell.openExternal(DISCORD_INVITE_URL));
    applicationIpc.handle('community:open-github', () => shell.openExternal(GITHUB_REPOSITORY_URL));
    ipcMain.on('app:quit', () => {
      if (coordinator.canAcceptWork()) app.quit();
    });
    const win = createWindow(preferencesStore);
    const selectedTheme = preferencesStore.read().theme;
    const editorWindow = createEditorWindowManager({
      applicationRoot,
      isPackaged: app.isPackaged,
      ipcMain: applicationIpc,
      hudWindow: win,
      hudController: controllers.get(win),
      registerController: (target, controller) => controllers.set(target, controller),
      initialDark: selectedTheme === 'dark' || (selectedTheme === 'system' && nativeTheme.shouldUseDarkColors),
      cleanupWindow: (contents) => {
        exportIpc.cleanupWindow(contents);
        cameraStorage.cleanupOwner(contents.id);
        microphoneStorage.cleanupOwner(contents.id);
        systemAudioStorage.cleanupOwner(contents.id);
      },
      canAcceptWork: () => coordinator.canAcceptWork(),
    });
    showExistingHud = () => {
      if (!coordinator.canAcceptWork()) return false;
      editorWindow.showHud();
      return true;
    };
    if (pendingHudRestore) restoreCanonicalHud();
    const trayManager = createTrayManager({
      applicationRoot,
      getWindow: () => win,
      getController: () => win && controllers.get(win),
      onShowHud: () => editorWindow.showHud(),
    });
    trayManager.init();

    // Every owned resource must be released on shutdown. The eagerly preloaded
    // countdown window is the hidden window that previously prevented
    // `window-all-closed`, so it is registered alongside every other resource.
    coordinator.registerCleanup({ id: 'hud-window', cleanup: () => win.destroy() });
    coordinator.registerCleanup({ id: 'editor', cleanup: () => editorWindow.destroy() });
    coordinator.registerCleanup({ id: 'tray', cleanup: () => trayManager.destroy() });
    coordinator.registerCleanup({ id: 'teleprompter', cleanup: () => teleprompterWindow.destroy() });
    coordinator.registerCleanup({ id: 'countdown', cleanup: () => countdownOverlay.destroy() });
    coordinator.registerCleanup({ id: 'camera-overlay', cleanup: () => cameraOverlay.destroy() });
    coordinator.registerCleanup({ id: 'screen-region', cleanup: () => screenRegionOverlay.destroy() });
    coordinator.registerCleanup({ id: 'preferences', cleanup: preferencesCleanup });

    win.on('closed', () => {
      if (coordinator.canAcceptWork()) app.quit();
    });

    win.webContents.once('destroyed', () => {
      exportIpc.cleanupWindow(win.webContents);
      cameraStorage.cleanupOwner(win.webContents.id);
      microphoneStorage.cleanupOwner(win.webContents.id);
      systemAudioStorage.cleanupOwner(win.webContents.id);
    });
    void updater.checkForUpdates();
    app.on('activate', () => {
      showExistingHud();
    });
  });

  app.on('before-quit', (event) => {
    if (coordinator.isComplete() || quitting) return;
    event.preventDefault();
    quitting = true;
    coordinator.requestShutdown('before-quit').finally(() => app.quit());
  });
  app.on('will-quit', () => {
    // Final synchronous/best-effort safety net, not the primary cleanup path.
    captureEngine.forceShutdown();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

initializeSingleInstance({
  app,
  initialize: initializeApplication,
  restoreHud: restoreCanonicalHud,
});
