const { initializeApplicationUpdater } = require('./lifecycle/application-updater.cjs');
const { createCaptureStores } = require('./storage/capture-stores.cjs');
const { prewarmCaptureCapabilities } = require('./lifecycle/capture-warmup.cjs');
const { organizeProjectCategories } = require('./storage/project-categories.cjs');
const { registerScreenshotIpc } = require('./screenshot/screenshot-ipc.cjs');
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
const {
  createProjectVoiceoverStorage,
  registerProjectVoiceoverIpc,
} = require('./projects/project-voiceover-storage.cjs');
const { createCameraRecordingControl } = require('./camera/recording-control.cjs');
const { registerCaptureWindowIpc } = require('./lifecycle/capture-window-ipc.cjs');
const { createProjectStore } = require('./projects/project-store.cjs');
const { createProjectMediaHandler } = require('./projects/project-media-protocol.cjs');
const { registerWindowIpc } = require('./window/window-ipc.cjs');
const { createRendererSetup } = require('./lifecycle/renderer-setup.cjs');
const { createEditorWindowManager } = require('./window/editor-window.cjs');
const { createOnboardingWindowManager } = require('./window/onboarding-window.cjs');
const { registerExportIpc } = require('./export/export-ipc.cjs');
const { registerTranscriptExportIpc } = require('./captions/transcript-export-ipc.cjs');
const { createCameraOverlayWindow } = require('./camera/overlay-window.cjs');
const { createCountdownWindow } = require('./countdown-window.cjs');
const { createScreenRegionOverlayWindow } = require('./screen-region-overlay.cjs');
const { createCameraStorage, registerCameraIpc } = require('./camera-ipc.cjs');
const { createMicrophoneStorage, registerMicrophoneIpc } = require('./microphone/ipc.cjs');
const { createSystemAudioStorage, registerSystemAudioIpc } = require('./system-audio/ipc.cjs');
const { createWhisperModelStore } = require('./captions/whisper-model-store.cjs');
const { registerWhisperIpc } = require('./captions/whisper-ipc.cjs');
const { createPreferencesStore } = require('./preferences/preferences-store.cjs');
const { registerEditorPresetIpc } = require('./presets/editor-preset-ipc.cjs');
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
const { createTrayManager } = require('./tray/tray-manager.cjs');
const { InputAccess, registerInputAccessIpc } = require('./input/input-access.cjs');
const { createShutdownCoordinator } = require('./lifecycle/shutdown-coordinator.cjs');
const { createShutdownAwareIpc } = require('./lifecycle/shutdown-ipc.cjs');
const { registerFatalLifecycle } = require('./lifecycle/fatal-events.cjs');
const { initializeSingleInstance } = require('./lifecycle/single-instance.cjs');
const { configureDevelopmentProfile } = require('./lifecycle/development-profile.cjs');
const { createQuickSnipService } = require('./quick-snip/quick-snip-service.cjs');
const DISCORD_INVITE_URL = 'https://discord.gg/6Q6v2xUCB';
const GITHUB_REPOSITORY_URL = 'https://github.com/BeamRecorder/Beam';

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
configureDevelopmentProfile(app);
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

const { isTrustedRenderer, configureMediaPermission, configureDesktopLoopback, getAppIconPath, createWindow } =
  createRendererSetup({ app, BrowserWindow, session, desktopCapturer, applicationRoot, controllers, logStartup });
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

  app
    .whenReady()
    .then(() => {
      logStartup('Electron app.whenReady resolved.');
      void prewarmCaptureCapabilities(captureEngine, { log: logStartup });
      configureMediaPermission();
      logStartup('Media permission policy registered.');
      configureDesktopLoopback();
      registerInputAccessIpc(applicationIpc, inputAccess);
      const userPaths = createUserPaths(app.getPath('videos'));
      organizeProjectCategories(userPaths.projects);
      const preferencesStore = createPreferencesStore(userPaths.preferences, { platform: process.platform });
      const startupPreferences = preferencesStore.repair();
      const { editorPresetStore, screenshotPresetStore, screenshotStore } = createCaptureStores({
        userPaths,
        preferencesStore,
        applicationRoot,
        isPackaged: app.isPackaged,
      });
      let screenshotService = null;
      let quickSnipController = null;
      let trayManager = null;
      const applySpellCheck = (preferences) =>
        applySpellCheckPreferences({
          electronSession: session.defaultSession,
          preferences,
          platform: process.platform,
          systemLocale: app.getLocale(),
        });
      applySpellCheck(startupPreferences);
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
      const dispatchShortcut = (id) => {
        if (id.startsWith('teleprompter.')) return teleprompterWindow.handleShortcut(id);
        if (id === 'quickSnip.toggle') {
          void quickSnipController?.toggle().catch((error) => console.error('[Quick Snip] toggle failed:', error));
          return true;
        }
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
      registerEditorPresetIpc({ ipcMain: applicationIpc, BrowserWindow, store: editorPresetStore });
      registerEditorPresetIpc({
        ipcMain: applicationIpc,
        BrowserWindow,
        store: screenshotPresetStore,
        kind: 'screenshot',
      });
      logStartup('Desktop loopback policy registered.');
      registerCaptureIpc({
        ipcMain,
        desktopCapturer,
        BrowserWindow,
        screen,
        captureEngine,
        app,
        userPaths,
        trackStorages: [cameraStorage, microphoneStorage, systemAudioStorage],
        canAcceptWork: () => coordinator.canAcceptWork(),
        canStartRecording: (event) => {
          const senderUrl = event?.sender?.getURL?.() || '';
          if (screenshotService?.isBusy()) return false;
          if (senderUrl.includes('quickSnipCrop=1')) return quickSnipController?.state().job?.mode !== 'screenshot';
          return (
            !screenshotService?.isBusy() &&
            (!quickSnipController ||
              ['idle', 'completed', 'failed', 'canceled'].includes(quickSnipController.state().state))
          );
        },
      });
      logStartup('Capture IPC registered.');
      registerCameraIpc({ ipcMain: applicationIpc, storage: cameraStorage });
      registerMicrophoneIpc({ ipcMain: applicationIpc, storage: microphoneStorage });
      registerSystemAudioIpc({ ipcMain: applicationIpc, storage: systemAudioStorage });
      logStartup('Capture track IPC registered.');
      const projectStore = createProjectStore(userPaths.projects, { category: 'studio' });
      const projectVoiceoverStorage = createProjectVoiceoverStorage({ projectStore });
      projectVoiceoverStorage.cleanupStalePartials();
      registerProjectVoiceoverIpc({ ipcMain: applicationIpc, storage: projectVoiceoverStorage });
      const backgroundLibrary = createBackgroundLibrary(userPaths);
      const fontLibrary = createFontLibrary(userPaths.fonts);
      const cursorLibrary = createCursorPackLibrary(userPaths.cursors);
      const teleprompterStorage = createTeleprompterStorage({ projectStore });
      registerTeleprompterIpc(applicationIpc, teleprompterWindow, teleprompterStorage, () => win.webContents);
      registerProjectIpc(
        applicationIpc,
        projectStore,
        backgroundLibrary,
        fontLibrary,
        require('electron').dialog,
        BrowserWindow,
        isTrustedRenderer,
        cursorLibrary,
        screenshotStore,
        require('electron').clipboard,
      );
      protocol.handle(
        'project-media',
        createProjectMediaHandler({ projectStore, backgroundLibrary, fontLibrary, cursorLibrary, screenshotStore }),
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
      let cameraRecordingCleanup = () => {};
      const cameraOverlay = createCameraOverlayWindow({
        ...lifecycleOptions,
        preferencesStore,
        platform: process.platform,
        onWebContentsDestroyed: (contents) => {
          if (contents) cameraStorage.cleanupOwner(contents.id);
          cameraRecordingCleanup('The camera overlay was closed while recording.');
        },
      });
      const countdownOverlay = createCountdownWindow(lifecycleOptions);
      const screenRegionOverlay = createScreenRegionOverlayWindow({
        ...lifecycleOptions,
        platform: process.platform,
        screen,
      });
      const quickSnipService = createQuickSnipService({
        captureEngine,
        BrowserWindow,
        applicationIpc,
        applicationRoot,
        isPackaged: app.isPackaged,
        platform: process.platform,
        screen,
        appIconPath,
        userPaths,
        preferencesStore,
        presetStore: editorPresetStore,
        screenshotPresetStore,
        screenshotStore,
        openScreenshot: (id) => editorWindow.open(id, { kind: 'screenshot' }),
        isScreenshotBusy: () => screenshotService?.isBusy() ?? false,
        openEditor: (projectId) => editorWindow.open(projectId),
        cleanupStatus: (contents) => exportIpc.cleanupWindow(contents),
        projectStore,
        regionOverlay: screenRegionOverlay,
        nativeImage: require('electron').nativeImage,
        clipboard: require('electron').clipboard,
        getTrayManager: () => trayManager,
      });
      quickSnipController = quickSnipService.controller;
      registerCaptureWindowIpc({ applicationIpc, BrowserWindow, cameraOverlay, countdownOverlay, screenRegionOverlay });
      logStartup('Window IPC registered.');
      const exportIpc = registerExportIpc({
        ipcMain: applicationIpc,
        dialog: require('electron').dialog,
        BrowserWindow,
        defaultExportDirectory: app.getPath('videos'),
        resolveAutomaticDestination: quickSnipService.exportDestination,
      });
      logStartup('Export IPC registered.');
      registerTranscriptExportIpc({
        ipcMain: applicationIpc,
        dialog: require('electron').dialog,
        BrowserWindow,
        defaultExportDirectory: app.getPath('documents'),
      });
      const updater = initializeApplicationUpdater({ app, BrowserWindow, autoUpdater, coordinator, applicationIpc });
      applicationIpc.handle('community:open-discord', () => shell.openExternal(DISCORD_INVITE_URL));
      applicationIpc.handle('community:open-github', () => shell.openExternal(GITHUB_REPOSITORY_URL));
      ipcMain.on('app:quit', () => {
        if (coordinator.canAcceptWork()) app.quit();
      });
      const win = createWindow(preferencesStore, appIconPath);
      cameraRecordingCleanup = createCameraRecordingControl({
        ipcMain: applicationIpc,
        cameraOverlay,
        hudWebContents: win.webContents,
        isRecordingOwner: (sender) => sender === win.webContents || quickSnipService.cropWindow.owns(sender),
      });
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
        screen,
        hudAuxiliaryWindows: [teleprompterWindow, countdownOverlay],
        hudController: controllers.get(win),
        registerController: (target, controller) => controllers.set(target, controller),
        preferencesStore,
        appIconPath,
        initialDark: selectedTheme === 'dark' || (selectedTheme === 'system' && nativeTheme.shouldUseDarkColors),
        resolveSystemDark: () => nativeTheme.shouldUseDarkColors,
        cleanupWindow: (contents) => {
          exportIpc.cleanupWindow(contents);
          cameraStorage.cleanupOwner(contents.id);
          microphoneStorage.cleanupOwner(contents.id);
          systemAudioStorage.cleanupOwner(contents.id);
          projectVoiceoverStorage.cleanupOwner(contents.id);
        },
        canAcceptWork: () => coordinator.canAcceptWork(),
      });
      screenshotService = registerScreenshotIpc({
        ipcMain: applicationIpc,
        store: screenshotStore,
        presetStore: screenshotPresetStore,
        captureEngine,
        BrowserWindow,
        dialog: require('electron').dialog,
        clipboard: require('electron').clipboard,
        nativeImage: require('electron').nativeImage,
        isTrustedRenderer,
        openEditor: (id, options, sender) => editorWindow.open(id, { ...options, kind: 'screenshot' }, sender),
        prepareCapture: quickSnipService.prepareScreenshot,
        canCapture: (event) =>
          !quickSnipService.isNormalRecordingActive() &&
          (['idle', 'completed', 'failed', 'canceled'].includes(quickSnipController.state().state) ||
            (quickSnipService.cropWindow.owns(event?.sender) &&
              quickSnipController.state().job?.mode === 'screenshot')),
        outputDirectory: userPaths.screenshots,
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
      trayManager = createTrayManager({
        applicationRoot,
        getWindow: () => win,
        getController: () => win && controllers.get(win),
        onShowHud: showExistingHud,
        onQuickSnip: () =>
          void quickSnipController.toggle().catch((error) => console.error('[Quick Snip] tray toggle failed:', error)),
      });
      trayManager.init();
      if (!preferencesStore.read().onboardingCompleted) onboardingWindow.open();

      coordinator.registerCleanup({ id: 'hud-window', cleanup: () => win.destroy() });
      coordinator.registerCleanup({ id: 'editor', cleanup: () => editorWindow.destroy() });
      coordinator.registerCleanup({ id: 'onboarding', cleanup: () => onboardingWindow.destroy() });
      coordinator.registerCleanup({ id: 'tray', cleanup: () => trayManager.destroy() });
      coordinator.registerCleanup({ id: 'teleprompter', cleanup: () => teleprompterWindow.destroy() });
      coordinator.registerCleanup({ id: 'spell-check-context-menu', cleanup: spellCheckContextMenuCleanup });
      coordinator.registerCleanup({ id: 'countdown', cleanup: () => countdownOverlay.destroy() });
      coordinator.registerCleanup({ id: 'camera-recording-control', cleanup: cameraRecordingCleanup });
      coordinator.registerCleanup({ id: 'camera-overlay', cleanup: () => cameraOverlay.destroy() });
      coordinator.registerCleanup({ id: 'screen-region', cleanup: () => screenRegionOverlay.destroy() });
      coordinator.registerCleanup({ id: 'quick-snip-crop', cleanup: () => quickSnipService.cropWindow.destroy() });
      coordinator.registerCleanup({ id: 'quick-snip-status', cleanup: () => quickSnipService.statusWindow.destroy() });
      coordinator.registerCleanup({ id: 'preferences', cleanup: preferencesCleanup });

      win.on('closed', () => {
        if (coordinator.canAcceptWork()) app.quit();
      });

      win.webContents.once('destroyed', () => {
        exportIpc.cleanupWindow(win.webContents);
        cameraStorage.cleanupOwner(win.webContents.id);
        microphoneStorage.cleanupOwner(win.webContents.id);
        systemAudioStorage.cleanupOwner(win.webContents.id);
        projectVoiceoverStorage.cleanupOwner(win.webContents.id);
      });
      void updater.checkForUpdates();
      app.on('activate', () => {
        showExistingHud();
      });
    })
    .catch((error) => {
      require('electron').dialog.showErrorBox('Beam could not start', String(error));
      app.quit();
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
