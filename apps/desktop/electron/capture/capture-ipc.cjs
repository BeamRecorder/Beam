const { readJsonSync } = require('@beam/storage/node/json-file');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { captureWindowExclusions } = require('./capture-window-exclusions.cjs');
const { buildDefaultCaptureConfig } = require('./capture-config.cjs');
const { createSystemAudioPreview } = require('./system-audio-preview.cjs');
const { isCaptureCancellation } = require('./capture-cancellation.cjs');
const { createSourcePreviewService } = require('./source-preview-service.cjs');
const { registerSourcePickerIpc } = require('../source-picker/source-picker-ipc.cjs');
const { registerScreenColorIpc } = require('./screen-color-ipc.cjs');
const { nativeDisplayBounds } = require('./display-coordinates.cjs');

const ALLOWED_COMMANDS = new Set([
  'discover',
  'cancel-region-selection',
  'capabilities',
  'permissions',
  'formats',
  'prepare',
  'start',
  'pause',
  'resume',
  'stop',
  'status',
  'start-system-audio-preview',
  'system-audio-preview-level',
  'stop-system-audio-preview',
]);

function completedVideoSource(session) {
  if (!session?.manifestPath) return session;
  const directory = path.dirname(session.manifestPath);
  const screenDirectory = path.join(directory, 'screen');
  const video = fs.existsSync(screenDirectory)
    ? fs
        .readdirSync(screenDirectory)
        .filter((name) => /\.mp4$/i.test(name))
        .sort()[0]
    : null;
  return video
    ? {
        ...session,
        videoSrc: pathToFileURL(path.join(screenDirectory, video)).href,
      }
    : session;
}

function withProjectId(session) {
  if (!session || typeof session !== 'object' || typeof session.manifestPath !== 'string') return session;
  try {
    const manifest = readJsonSync(session.manifestPath);
    return typeof manifest.projectId === 'string' ? { ...session, projectId: manifest.projectId } : session;
  } catch {
    return session;
  }
}

function registerCaptureIpc({
  ipcMain,
  desktopCapturer,
  BrowserWindow,
  screen,
  app,
  captureEngine,
  inputAccess,
  userPaths,
  trackStorages,
  teleprompterWindow,
  platform = process.platform,
  isTrustedRenderer = () => false,
  canAcceptWork = () => true,
  canStartRecording = () => true,
}) {
  registerScreenColorIpc({
    ipcMain,
    app,
    BrowserWindow,
    platform,
    applicationRoot: path.resolve(__dirname, '../../../..'),
    isTrustedRenderer,
    canAcceptWork,
  });
  let activeSessionId = null;
  const registerSession = (session) => {
    activeSessionId = session?.sessionId ?? null;
    for (const storage of trackStorages) storage.registerSession(session);
    return withProjectId(session);
  };
  const completeSession = (session) => {
    const completed = trackStorages.reduce((value, storage) => storage.complete(value), session);
    if (activeSessionId === session?.sessionId) activeSessionId = null;
    return completed;
  };
  let deferredStoppedSession = null;
  let systemAudioPreview;
  const requestEngine = async (command, payload = {}) => {
    if (command === 'prepare' && deferredStoppedSession)
      throw new Error('Complete the previous recording before starting another recording.');
    if (command === 'prepare') systemAudioPreview?.invalidate();
    try {
      const cursor = payload.config?.cursor;
      if (
        command === 'prepare' &&
        platform === 'linux' &&
        cursor?.mode === 'separate' &&
        (cursor.captureClicks === true || cursor.captureShortcuts === true)
      )
        await inputAccess.ensureReady(cursor);
      // A poisoned engine respawns a fresh process on its next request; the
      // previous (timed out) session is gone and must not be completed.
      return await captureEngine.request(command, payload);
    } catch (error) {
      if (captureEngine.isPoisoned) {
        if (activeSessionId) {
          for (const storage of trackStorages) storage.forgetSession(activeSessionId);
          activeSessionId = null;
        }
        deferredStoppedSession = null;
        systemAudioPreview?.invalidate();
      }
      const message = error instanceof Error ? error.message : String(error);
      const wrapped = new Error(`capture-engine a échoué pour "${command}": ${message}`);
      wrapped.code = error?.code || 'capture-engine-error';
      throw wrapped;
    }
  };
  if (platform === 'linux')
    systemAudioPreview = createSystemAudioPreview({
      request: requestEngine,
      canStart: canAcceptWork,
      canCleanup: () => canAcceptWork() && captureEngine.canCleanup(),
    });
  const sourcePreviews = createSourcePreviewService({
    requestNative: requestEngine,
    platform,
  });
  const sourcePicker = registerSourcePickerIpc({
    ipcMain,
    BrowserWindow,
    screen,
    app,
    platform,
    desktopCapturer,
    applicationRoot: path.resolve(__dirname, '../../../..'),
    requestNative: requestEngine,
    getNativePreview: sourcePreviews.get,
    canAcceptWork,
  });
  let pendingDefaultPreparation = null;
  const prepareDefaultRecording = (options) => {
    const key = JSON.stringify(options || {});
    if (pendingDefaultPreparation) {
      if (pendingDefaultPreparation.key !== key)
        throw new Error('A different native recording preparation is already in progress.');
      return pendingDefaultPreparation.promise;
    }
    const promise = (async () => {
      const catalog = await requestEngine('discover');
      const config = buildDefaultCaptureConfig(catalog, options || {}, {
        platform,
        defaultOutputRoot: userPaths.studioProjects,
        excludedProcessId: process.pid,
      });
      try {
        config.excludedWindowHandles = [
          ...new Set([...config.excludedWindowHandles, ...captureWindowExclusions(BrowserWindow, platform)]),
        ];
        return withProjectId(await requestEngine('prepare', { config }));
      } catch (error) {
        if (isCaptureCancellation(error)) return null;
        throw error;
      }
    })();
    const preparation = { key, promise };
    pendingDefaultPreparation = preparation;
    const clearPreparation = () => {
      if (pendingDefaultPreparation === preparation) pendingDefaultPreparation = null;
    };
    void promise.then(clearPreparation, clearPreparation);
    return promise;
  };
  ipcMain.handle('capture:request', async (event, command, payload = {}) => {
    if (!canAcceptWork()) {
      const error = new Error(`capture command "${command}" rejected during application shutdown`);
      error.code = 'application-shutting-down';
      throw error;
    }
    if (systemAudioPreview) {
      if (command === 'start-system-audio-preview') return systemAudioPreview.start(event.sender);
      if (command === 'stop-system-audio-preview') return systemAudioPreview.stop(event.sender);
      if (command === 'system-audio-preview-level') return systemAudioPreview.level(event.sender);
    }
    if (
      ['start-default-recording', 'prepare-default-recording', 'start-recording', 'prepare', 'start'].includes(
        command,
      ) &&
      !canStartRecording(event)
    ) {
      throw new Error('A Quick Snip capture is already active.');
    }
    if (command === 'start-default-recording') {
      const catalog = await requestEngine('discover');
      const config = buildDefaultCaptureConfig(catalog, payload.options || {}, {
        platform,
        defaultOutputRoot: userPaths.studioProjects,
        excludedProcessId: process.pid,
      });
      await requestEngine('prepare', { config });
      const session = await requestEngine('start');
      return registerSession(session);
    }
    if (command === 'prepare-default-recording') return prepareDefaultRecording(payload.options);
    if (command === 'cancel-region-selection') {
      teleprompterWindow?.clearRegionConstraint();
      return requestEngine(command);
    }
    if (command === 'start-prepared-recording') return registerSession(await requestEngine('start'));
    if (command === 'cancel-prepared-recording') {
      await requestEngine('cancel');
      return undefined;
    }
    if (command === 'discard-recording') {
      for (const storage of trackStorages) storage.forgetSession(payload.sessionId);
      const session = await requestEngine('discard');
      for (const storage of trackStorages) storage.forgetSession(session?.sessionId);
      activeSessionId = null;
      return undefined;
    }
    if (command === 'start-recording') {
      await requestEngine('prepare', { config: payload.config });
      const session = await requestEngine('start');
      return registerSession(session);
    }
    if (command === 'stop-native-recording') {
      if (deferredStoppedSession)
        throw new Error('A native recording is already waiting for its sidecar tracks to finish.');
      try {
        deferredStoppedSession = await requestEngine('stop');
      } catch (error) {
        // A source can disappear before native finalization. The engine still
        // writes the completed manifest, so keep that partial recording usable.
        const status = await requestEngine('status').catch(() => null);
        if (status?.state !== 'completed' || !status.manifestPath) throw error;
        deferredStoppedSession = status;
      }
      return withProjectId(deferredStoppedSession);
    }
    if (command === 'complete-native-recording') {
      if (!deferredStoppedSession) throw new Error('No native recording is waiting for completion.');
      const session = completeSession(deferredStoppedSession);
      deferredStoppedSession = null;
      return withProjectId(completedVideoSource(session));
    }
    if (command === 'stop') return withProjectId(completedVideoSource(completeSession(await requestEngine('stop'))));
    if (!ALLOWED_COMMANDS.has(command)) throw new Error(`Commande de capture interdite: ${command}`);
    return withProjectId(await requestEngine(command, payload));
  });
  ipcMain.handle('window:getSources', async (event, types) => {
    // Chromium's desktopCapturer opens the system Portal picker for every
    // enumeration on Wayland. The Rust backend owns the single Portal picker,
    // so Electron preview IDs are never used on Linux.
    if (platform === 'linux') return [];
    const sources = await desktopCapturer.getSources({
      types: types || ['window', 'screen'],
      thumbnailSize: { width: 300, height: 200 },
      fetchWindowIcons: true,
    });
    const ownSourceId = BrowserWindow?.fromWebContents?.(event?.sender)?.getMediaSourceId?.() ?? null;
    return sources
      .filter((source) => source.id !== ownSourceId)
      .map((source) => {
        const display = source.display_id
          ? screen.getAllDisplays().find((item) => String(item.id) === String(source.display_id))
          : null;
        return {
          id: source.id,
          name: source.name,
          thumbnail: source.thumbnail.toDataURL(),
          appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
          displayId: source.display_id || undefined,
          displayBounds: display?.bounds,
        };
      });
  });
  ipcMain.handle('capture:source-preview', (_event, request) => {
    if (!canAcceptWork()) {
      const error = new Error('source preview rejected during application shutdown');
      error.code = 'application-shutting-down';
      throw error;
    }
    return sourcePreviews.get(request);
  });
  ipcMain.handle('screen:get-display-bounds', (_event, displayId) =>
    nativeDisplayBounds(screen, requestEngine, displayId, platform),
  );
  return { sourcePicker };
}

module.exports = { registerCaptureIpc };
