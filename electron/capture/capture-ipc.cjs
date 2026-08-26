const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { buildDefaultCaptureConfig } = require('./capture-config.cjs');

const ALLOWED_COMMANDS = new Set([
  'discover',
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
  return video ? { ...session, videoSrc: pathToFileURL(path.join(screenDirectory, video)).href } : session;
}

function withProjectId(session) {
  if (!session || typeof session !== 'object' || typeof session.manifestPath !== 'string') return session;
  try {
    const manifest = JSON.parse(fs.readFileSync(session.manifestPath, 'utf8'));
    return typeof manifest.projectId === 'string' ? { ...session, projectId: manifest.projectId } : session;
  } catch {
    return session;
  }
}

function displayBoundsForId(screen, displayId) {
  if (typeof displayId !== 'string' || displayId.length === 0 || displayId.length > 128) return null;
  const display = screen.getAllDisplays().find((item) => String(item.id) === displayId);
  const bounds = display?.bounds;
  if (
    !bounds ||
    !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(bounds[key])) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    return null;
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}

function registerCaptureIpc({
  ipcMain,
  desktopCapturer,
  BrowserWindow,
  screen,
  captureEngine,
  app,
  userPaths,
  trackStorages,
  platform = process.platform,
  canAcceptWork = () => true,
}) {
  const registerSession = (session) => {
    for (const storage of trackStorages) storage.registerSession(session);
    return withProjectId(session);
  };
  const completeSession = (session) => trackStorages.reduce((value, storage) => storage.complete(value), session);
  let deferredStoppedSession = null;
  const requestEngine = async (command, payload = {}) => {
    try {
      // A poisoned engine respawns a fresh process on its next request; the
      // previous (timed out) session is gone and must not be completed.
      return await captureEngine.request(command, payload);
    } catch (error) {
      if (captureEngine.isPoisoned) deferredStoppedSession = null;
      const message = error instanceof Error ? error.message : String(error);
      const wrapped = new Error(`capture-engine a échoué pour "${command}": ${message}`);
      wrapped.code = error?.code || 'capture-engine-error';
      throw wrapped;
    }
  };
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
        defaultOutputRoot: userPaths.projects,
        excludedProcessId: process.pid,
      });
      return withProjectId(await requestEngine('prepare', { config }));
    })();
    const preparation = { key, promise };
    pendingDefaultPreparation = preparation;
    const clearPreparation = () => {
      if (pendingDefaultPreparation === preparation) pendingDefaultPreparation = null;
    };
    void promise.then(clearPreparation, clearPreparation);
    return promise;
  };
  ipcMain.handle('capture:request', async (_event, command, payload = {}) => {
    if (!canAcceptWork()) {
      const error = new Error(`capture command "${command}" rejected during application shutdown`);
      error.code = 'application-shutting-down';
      throw error;
    }
    if (command === 'start-default-recording') {
      const catalog = await requestEngine('discover');
      const config = buildDefaultCaptureConfig(catalog, payload.options || {}, {
        platform,
        defaultOutputRoot: userPaths.projects,
        excludedProcessId: process.pid,
      });
      await requestEngine('prepare', { config });
      const session = await requestEngine('start');
      return registerSession(session);
    }
    if (command === 'prepare-default-recording') return prepareDefaultRecording(payload.options);
    if (command === 'start-prepared-recording') return registerSession(await requestEngine('start'));
    if (command === 'cancel-prepared-recording') {
      await requestEngine('cancel');
      return undefined;
    }
    if (command === 'discard-recording') {
      for (const storage of trackStorages) storage.forgetSession(payload.sessionId);
      const session = await requestEngine('discard');
      for (const storage of trackStorages) storage.forgetSession(session?.sessionId);
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
  ipcMain.handle('screen:get-display-bounds', (_event, displayId) => displayBoundsForId(screen, displayId));
}

module.exports = { displayBoundsForId, registerCaptureIpc };
