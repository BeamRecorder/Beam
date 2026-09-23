const { buildDefaultCaptureConfig } = require('./capture-config.cjs');
const { isCaptureCancellation } = require('./capture-cancellation.cjs');
const { createSourcePreviewService } = require('./source-preview-service.cjs');
const { nativeCatalog, nativeDevices } = require('./native-catalog.cjs');
const { sessionResult } = require('./native-session.cjs');
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
  userPaths,
  platform = process.platform,
  canAcceptWork = () => true,
  canStartRecording = () => true,
}) {
  let owner = null;
  let sessionId = null;
  let preparing = false;
  const request = (command, payload = {}) => captureEngine.request(command, payload);
  const sourcePreviews = createSourcePreviewService({ requestNative: request, platform });
  const assertOwner = (event) => {
    if (owner !== event.sender.id || !sessionId) throw new Error('This renderer does not own the recording session.');
  };
  const prepare = async (event, options) => {
    if (preparing || !canStartRecording(event)) throw new Error('A recording preparation is already active.');
    preparing = true;
    try {
      const catalog = await nativeCatalog(captureEngine);
      const config = buildDefaultCaptureConfig(catalog, options || {}, {
        platform,
        instantRoot: userPaths.instantProjects,
      });
      const result = await request('prepare', { config });
      owner = event.sender.id;
      sessionId = result.sessionId;
      return sessionResult(result);
    } catch (error) {
      if (isCaptureCancellation(error)) return null;
      throw error;
    } finally {
      preparing = false;
    }
  };
  ipcMain.handle('media:request', async (event, command, payload = {}) => {
    if (!canAcceptWork()) throw new Error('Media commands are disabled during application shutdown.');
    if (command === 'sources') return nativeCatalog(captureEngine);
    if (command === 'devices') return nativeDevices(await request('sources'));
    if (['permissions', 'capabilities'].includes(command)) return request(command);
    if (command === 'prepare') return prepare(event, payload.options);
    if (command === 'camera-preview') return sessionId ? request('camera-preview', { sessionId }) : null;
    if (command === 'levels') {
      if (!sessionId) return { microphone: null, systemAudio: null };
      return request('levels', { sessionId });
    }
    if (command === 'status') {
      const status = sessionResult(await request('status'));
      if (sessionId && ['recording', 'paused'].includes(status.state)) {
        const levels = await request('levels', { sessionId });
        status.systemAudioLevel = levels.systemAudio?.peak ?? null;
        status.microphoneLevel = levels.microphone?.peak ?? null;
      }
      return status;
    }
    if (['start', 'pause', 'resume', 'stop', 'cancel'].includes(command)) {
      assertOwner(event);
      if (payload.sessionId && payload.sessionId !== sessionId) throw new Error('Stale recording session.');
      const result = sessionResult(await request(command, { sessionId }));
      if (['stop', 'cancel'].includes(command)) {
        owner = null;
        sessionId = null;
      }
      return result;
    }
    throw new Error(`Unsupported media command: ${command}`);
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
  ipcMain.handle('capture:source-preview', (_event, input) => {
    if (!canAcceptWork()) throw new Error('Source preview rejected during shutdown.');
    return sourcePreviews.get(input);
  });
  ipcMain.handle('screen:get-display-bounds', (_event, displayId) => displayBoundsForId(screen, displayId));
}
module.exports = { displayBoundsForId, registerCaptureIpc };
