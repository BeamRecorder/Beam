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
  screen,
  captureEngine,
  app,
  userPaths,
  trackStorages,
  platform = process.platform,
}) {
  const registerSession = (session) => {
    for (const storage of trackStorages) storage.registerSession(session);
    return withProjectId(session);
  };
  const completeSession = (session) => trackStorages.reduce((value, storage) => storage.complete(value), session);
  let deferredStoppedSession = null;
  ipcMain.handle('capture:request', async (_event, command, payload = {}) => {
    if (command === 'start-default-recording') {
      const catalog = await captureEngine.request('discover');
      const config = buildDefaultCaptureConfig(catalog, payload.options || {}, {
        platform,
        defaultOutputRoot: userPaths.projects,
        excludedProcessId: process.pid,
      });
      await captureEngine.request('prepare', { config });
      const session = await captureEngine.request('start');
      return registerSession(session);
    }
    if (command === 'prepare-default-recording') {
      const catalog = await captureEngine.request('discover');
      const config = buildDefaultCaptureConfig(catalog, payload.options || {}, {
        platform,
        defaultOutputRoot: userPaths.projects,
        excludedProcessId: process.pid,
      });
      return withProjectId(await captureEngine.request('prepare', { config }));
    }
    if (command === 'start-prepared-recording') return registerSession(await captureEngine.request('start'));
    if (command === 'cancel-prepared-recording') {
      await captureEngine.request('cancel');
      return undefined;
    }
    if (command === 'discard-recording') {
      for (const storage of trackStorages) storage.forgetSession(payload.sessionId);
      const session = await captureEngine.request('discard');
      for (const storage of trackStorages) storage.forgetSession(session?.sessionId);
      return undefined;
    }
    if (command === 'start-recording') {
      await captureEngine.request('prepare', { config: payload.config });
      const session = await captureEngine.request('start');
      return registerSession(session);
    }
    if (command === 'stop-native-recording') {
      if (deferredStoppedSession)
        throw new Error('A native recording is already waiting for its sidecar tracks to finish.');
      deferredStoppedSession = await captureEngine.request('stop');
      return withProjectId(deferredStoppedSession);
    }
    if (command === 'complete-native-recording') {
      if (!deferredStoppedSession) throw new Error('No native recording is waiting for completion.');
      const session = completeSession(deferredStoppedSession);
      deferredStoppedSession = null;
      return withProjectId(completedVideoSource(session));
    }
    if (command === 'stop')
      return withProjectId(completedVideoSource(completeSession(await captureEngine.request('stop'))));
    if (!ALLOWED_COMMANDS.has(command)) throw new Error(`Commande de capture interdite: ${command}`);
    return withProjectId(await captureEngine.request(command, payload));
  });
  ipcMain.handle('window:getSources', async (_event, types) => {
    // Chromium's desktopCapturer opens the system Portal picker for every
    // enumeration on Wayland. Beam's Linux product recorder remains gated, so
    // these Electron preview IDs cannot be consumed by the Rust backend.
    if (platform === 'linux') return [];
    const sources = await desktopCapturer.getSources({
      types: types || ['window', 'screen'],
      thumbnailSize: { width: 300, height: 200 },
      fetchWindowIcons: true,
    });
    return sources.map((source) => {
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
