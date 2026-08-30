const {
  app,
  BrowserWindow,
  Menu,
  desktopCapturer,
  ipcMain,
  session,
  protocol,
  globalShortcut,
  screen,
  shell,
  nativeTheme,
  powerMonitor,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { CaptureEngine } = require('./capture/capture-engine.cjs');
const { registerCaptureIpc } = require('./capture/capture-ipc.cjs');
const { registerProjectIpc } = require('./projects/project-ipc.cjs');
const { createProjectStore } = require('./projects/project-store.cjs');
const { createProjectMediaHandler } = require('./projects/project-media-protocol.cjs');
const { WindowController } = require('./window/window-controller.cjs');
const { registerWindowIpc } = require('./window/window-ipc.cjs');
const { shouldAutoOpenDevTools } = require('./window/devtools-policy.cjs');
const { createEditorWindowManager } = require('./window/editor-window.cjs');
const { createOnboardingWindowManager } = require('./window/onboarding-window.cjs');
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
const { applySpellCheckPreferences } = require('./preferences/spell-check.cjs');
const { registerSpellCheckContextMenu } = require('./preferences/spell-check-context-menu.cjs');
const { createLinuxShortcutSource } = require('./preferences/linux-shortcut-source.cjs');
const { createTeleprompterWindow } = require('./teleprompter/teleprompter-window.cjs');
const { registerTeleprompterIpc } = require('./teleprompter/teleprompter-ipc.cjs');
const { createTeleprompterStorage } = require('./teleprompter/teleprompter-storage.cjs');
const { createUserPaths } = require('./storage/user-paths.cjs');
const { createBackgroundLibrary } = require('./backgrounds/background-library.cjs');
const { createFontLibrary } = require('./fonts/font-library.cjs');
const { createCursorPackLibrary } = require('./cursors/cursor-pack-library.cjs');
const { createAutoUpdater, registerUpdateIpc } = require('./updates/auto-updater.cjs');
const { createUpdateCache, updaterCacheDirectory } = require('./updates/update-cache.cjs');
const { createTrayManager } = require('./tray/tray-manager.cjs');
const { InputAccess, registerInputAccessIpc } = require('./input/input-access.cjs');
const { createShutdownCoordinator } = require('./lifecycle/shutdown-coordinator.cjs');
const { createShutdownAwareIpc } = require('./lifecycle/shutdown-ipc.cjs');
const { registerFatalLifecycle } = require('./lifecycle/fatal-events.cjs');
const { initializeSingleInstance } = require('./lifecycle/single-instance.cjs');

const DISCORD_INVITE_URL = 'https://discord.gg/6Q6v2xUCB';
const GITHUB_REPOSITORY_URL = 'https://github.com/BeamRecorder/Beam';

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
if (process.platform === 'linux') {
  // Use Chromium's XDG GlobalShortcuts portal on desktops that provide it.
  app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal');
}
const controllers = new WeakMap();
let captureEngine = null;
let coordinator = null;
let quitting = false;
let showExistingHud = () => false;
let pendingHudRestore = false;
let shortcutReady = false;
const pendingExternalShortcuts = [];
let externalShortcutHandler = (id) => {
  pendingExternalShortcuts.push(id);
  return false;
};

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
  if (url.startsWith('file://')) {
    try {
      const file = require('url').fileURLToPath(url);
      const root = path.resolve(applicationRoot);
      const target = path.resolve(file);
      return target === root || target.startsWith(`${root}${path.sep}`);
    } catch {
      return false;
    }
  }
  try {
    const target = new URL(url);
    return (
      target.origin === 'http://localhost:6500' &&
      ['/', '/index.html', '/editor.html', '/teleprompter.html', '/onboarding.html'].includes(target.pathname)
    );
  } catch {
    return false;
  }
}

function configureMediaPermission() {
  const trusted = (webContents) => Boolean(webContents) && isTrustedRenderer(webContents.getURL());
  const allowed = new Set(['media', 'camera', 'microphone', 'display-capture', 'speaker-selection', 'local-fonts']);
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission) => trusted(webContents) && allowed.has(permission),
  );
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (!trusted(webContents)) return callback(false);
    callback(allowed.has(permission));
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
  const extensions = process.platform === 'win32' ? ['ico', 'png'] : ['png', 'ico'];
  const roots = [
    path.join(applicationRoot, 'dist/brand'),
    path.join(applicationRoot, 'public/brand'),
    path.join(__dirname, '../dist/brand'),
    path.join(__dirname, '../public/brand'),
  ];
  const candidates = roots.flatMap((root) => extensions.map((extension) => path.join(root, `BeamIcon.${extension}`)));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(applicationRoot, `public/brand/BeamIcon.${extensions[0]}`);
}

function createWindow(preferencesStore, appIconPath) {
  logStartup('Creating BrowserWindow.');
  const win = new BrowserWindow({
    width: 352,
    height: 512,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    icon: appIconPath,
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
    if (preferencesStore.read().onboardingCompleted) controller.markReadyToShow();
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
    const applySpellCheck = (preferences) =>
      applySpellCheckPreferences({
        electronSession: session.defaultSession,
        preferences,
        platform: process.platform,
        systemLocale: app.getLocale(),
      });
    applySpellCheck(preferencesStore.read());
    const spellCheckContextMenuCleanup = registerSpellCheckContextMenu({
      app,
      Menu,
      BrowserWindow,
      isTrustedRenderer,
      getLocale: () => preferencesStore.read()?.extras?.locale || app.getLocale(),
    });
    const appIconPath = getAppIconPath();
    const teleprompterWindow = createTeleprompterWindow({
      applicationRoot,
      isPackaged: app.isPackaged,
      preferencesStore,
      appIconPath,
    });
    setTimeout(() => teleprompterWindow.prepare(), 0);
    const dispatchShortcut = (id) => {
      if (id.startsWith('teleprompter.')) return teleprompterWindow.handleShortcut(id);
      BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('preferences:shortcut', id));
      return true;
    };
    externalShortcutHandler = (id) => {
      if (!shortcutReady) {
        pendingExternalShortcuts.push(id);
        return false;
      }
      if (preferencesStore.read().shortcuts[id]?.scope === 'global') return dispatchShortcut(id);
      return false;
    };
    const preferencesCleanup = registerPreferencesIpc({
      ipcMain: applicationIpc,
      BrowserWindow,
      globalShortcut,
      store: preferencesStore,
      shortcutHandler: dispatchShortcut,
      linuxShortcutSource: createLinuxShortcutSource({
        app,
        applicationRoot,
        platform: process.platform,
      }),
      onPreferencesChanged: (preferences) => {
        applySpellCheck(preferences);
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
    const backgroundLibrary = createBackgroundLibrary(userPaths);
    const fontLibrary = createFontLibrary(userPaths.fonts);
    const cursorLibrary = createCursorPackLibrary(userPaths.cursors);
    const teleprompterStorage = createTeleprompterStorage({ projectStore });
    registerTeleprompterIpc({ ipcMain: applicationIpc, teleprompterWindow, storage: teleprompterStorage });
    registerProjectIpc(
      applicationIpc,
      projectStore,
      backgroundLibrary,
      fontLibrary,
      require('electron').dialog,
      BrowserWindow,
      isTrustedRenderer,
      cursorLibrary,
    );
    protocol.handle(
      'project-media',
      createProjectMediaHandler({ projectStore, backgroundLibrary, fontLibrary, cursorLibrary }),
    );
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
    const cameraOverlay = createCameraOverlayWindow({
      ...lifecycleOptions,
      preferencesStore,
      platform: process.platform,
    });
    const countdownOverlay = createCountdownWindow(lifecycleOptions);
    const screenRegionOverlay = createScreenRegionOverlayWindow({
      ...lifecycleOptions,
      platform: process.platform,
      screen,
    });
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
    applicationIpc.handle('screen-region:select', (event, options) =>
      screenRegionOverlay.select(options, BrowserWindow.fromWebContents(event.sender)),
    );
    applicationIpc.on('screen-region:show', (_event, options) => screenRegionOverlay.show(options));
    applicationIpc.on('screen-region:hide', () => screenRegionOverlay.hide());
    applicationIpc.on('screen-region:confirm', (_event, region) => screenRegionOverlay.confirm(region));
    applicationIpc.on('screen-region:cancel', () => screenRegionOverlay.cancel());
    applicationIpc.handle('camera-overlay:state', () => cameraOverlay.state());
    logStartup('Window IPC registered.');
    const exportIpc = registerExportIpc({
      ipcMain: applicationIpc,
      dialog: require('electron').dialog,
      BrowserWindow,
      defaultExportDirectory: app.getPath('videos'),
    });
    logStartup('Export IPC registered.');
    const updateCache = app.isPackaged
      ? createUpdateCache({
          stateFile: path.join(app.getPath('userData'), 'update-cache-state.json'),
          cacheDirectory: updaterCacheDirectory(),
        })
      : null;
    if (updateCache) {
      try {
        updateCache.cleanupForVersion(app.getVersion());
      } catch (error) {
        console.warn('[Updater] Unable to clean installed update cache:', error);
      }
    }
    const updater = createAutoUpdater({
      app,
      BrowserWindow,
      autoUpdater,
      openExternal: require('electron').shell.openExternal,
      beforeQuitAndInstall: () => coordinator.requestShutdown('updater'),
      onUpdateDownloaded: (targetVersion) => {
        try {
          updateCache?.markDownloaded(app.getVersion(), targetVersion);
        } catch (error) {
          console.warn('[Updater] Unable to record the downloaded update:', error);
        }
      },
    });
    registerUpdateIpc(applicationIpc, updater);
    applicationIpc.handle('community:open-discord', () => shell.openExternal(DISCORD_INVITE_URL));
    applicationIpc.handle('community:open-github', () => shell.openExternal(GITHUB_REPOSITORY_URL));
    ipcMain.on('app:quit', () => {
      if (coordinator.canAcceptWork()) app.quit();
    });
    const win = createWindow(preferencesStore, appIconPath);
    win.webContents.once('did-finish-load', () => {
      shortcutReady = true;
      for (const id of pendingExternalShortcuts.splice(0)) externalShortcutHandler(id);
    });
    const selectedTheme = preferencesStore.read().theme;
    const editorWindow = createEditorWindowManager({
      applicationRoot,
      isPackaged: app.isPackaged,
      ipcMain: applicationIpc,
      hudWindow: win,
      hudController: controllers.get(win),
      registerController: (target, controller) => controllers.set(target, controller),
      preferencesStore,
      appIconPath,
      screen,
      initialDark: selectedTheme === 'dark' || (selectedTheme === 'system' && nativeTheme.shouldUseDarkColors),
      resolveSystemDark: () => nativeTheme.shouldUseDarkColors,
      cleanupWindow: (contents) => {
        exportIpc.cleanupWindow(contents);
        cameraStorage.cleanupOwner(contents.id);
        microphoneStorage.cleanupOwner(contents.id);
        systemAudioStorage.cleanupOwner(contents.id);
      },
      canAcceptWork: () => coordinator.canAcceptWork(),
    });
    const onboardingWindow = createOnboardingWindowManager({
      applicationRoot,
      isPackaged: app.isPackaged,
      ipcMain: applicationIpc,
      hudWindow: win,
      hudController: controllers.get(win),
      registerController: (target, controller) => controllers.set(target, controller),
      preferencesStore,
      appIconPath,
      initialDark: selectedTheme === 'dark' || (selectedTheme === 'system' && nativeTheme.shouldUseDarkColors),
    });
    showExistingHud = () => {
      if (!coordinator.canAcceptWork()) return false;
      onboardingWindow.destroy();
      return editorWindow.showHud();
    };
    if (pendingHudRestore) restoreCanonicalHud();
    const trayManager = createTrayManager({
      applicationRoot,
      getWindow: () => win,
      getController: () => win && controllers.get(win),
      onShowHud: showExistingHud,
    });
    trayManager.init();
    if (!preferencesStore.read().onboardingCompleted) onboardingWindow.open();

    // Every owned resource must be released on shutdown. The eagerly preloaded
    // countdown window is the hidden window that previously prevented
    // `window-all-closed`, so it is registered alongside every other resource.
    coordinator.registerCleanup({ id: 'hud-window', cleanup: () => win.destroy() });
    coordinator.registerCleanup({ id: 'editor', cleanup: () => editorWindow.destroy() });
    coordinator.registerCleanup({ id: 'onboarding', cleanup: () => onboardingWindow.destroy() });
    coordinator.registerCleanup({ id: 'tray', cleanup: () => trayManager.destroy() });
    coordinator.registerCleanup({ id: 'teleprompter', cleanup: () => teleprompterWindow.destroy() });
    coordinator.registerCleanup({ id: 'spell-check-context-menu', cleanup: spellCheckContextMenuCleanup });
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
  handleShortcut: (id) => externalShortcutHandler(id),
});
