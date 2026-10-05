const { windowsDisplaySource } = require('../capture/display-coordinates.cjs');

function windowSourceId(id, platform) {
  const match = /^window:(\d+)(?::|$)/.exec(id);
  if (!match) return id;
  return platform === 'darwin' ? `sck:window:${match[1]}` : `wgc:window:${BigInt(match[1]).toString(16)}`;
}

function sourceDescription(id, kind, name, format, extra = {}) {
  const separator = name.lastIndexOf(' — ');
  const app = kind === 'screen' ? '' : separator < 0 ? '' : name.slice(separator + 3);
  return {
    id,
    kind,
    name: separator < 0 ? name : name.slice(0, separator),
    app,
    detail: format ? `${format.width} × ${format.height}` : '',
    aspect: format?.width > 0 && format?.height > 0 ? format.width / format.height : 16 / 9,
    thumbnail: null,
    appIcon: null,
    ...extra,
  };
}

function validBounds(value) {
  if (
    !value ||
    !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key])) ||
    value.width < 1 ||
    value.height < 1
  )
    throw new Error('The capture target has invalid bounds');
  return Object.fromEntries(['x', 'y', 'width', 'height'].map((key) => [key, Math.round(value[key])]));
}

function createNativeSourceProvider({
  platform,
  screen,
  desktopCapturer,
  BrowserWindow,
  requestNative,
  getNativePreview,
}) {
  let electronSources = [];
  let pendingThumbnails = null;
  let refreshedAt = 0;
  const refreshThumbnails = async () => {
    if (pendingThumbnails) return pendingThumbnails;
    if (Date.now() - refreshedAt < 400) return electronSources;
    pendingThumbnails = desktopCapturer
      .getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 300, height: 200 },
        fetchWindowIcons: true,
      })
      .then((sources) => {
        electronSources = sources;
        refreshedAt = Date.now();
        return sources;
      })
      .finally(() => {
        pendingThumbnails = null;
      });
    return pendingThumbnails;
  };
  const list = async () => {
    if (platform === 'linux') throw new Error('Linux capture sources are selected by the Portal');
    const catalog = await requestNative('discover');
    const ownIds = new Set(
      BrowserWindow.getAllWindows()
        .filter((target) => !target.isDestroyed() && !target.webContents.getURL().includes('/editor.html'))
        .map((target) => windowSourceId(target.getMediaSourceId(), platform)),
    );
    const sources = [];
    if (platform === 'win32') {
      const previews = await refreshThumbnails();
      for (const preview of previews) {
        const kind = preview.id.startsWith('screen:') ? 'screen' : 'window';
        let id = windowSourceId(preview.id, platform);
        let bounds;
        if (kind === 'screen') {
          const display = screen.getAllDisplays().find((entry) => String(entry.id) === preview.display_id);
          if (!display) continue;
          id = await windowsDisplaySource(screen, requestNative, display.bounds);
          bounds = validBounds(display.bounds);
        }
        if (ownIds.has(id)) continue;
        const native = catalog.sources.find((source) => source.id === id);
        const format = native?.capabilities?.formats?.find((entry) => entry.kind === 'video' || entry.width > 0);
        sources.push(
          sourceDescription(id, kind, preview.name, format, {
            bounds,
            displayId: preview.display_id || undefined,
            thumbnail: preview.thumbnail.toDataURL(),
            appIcon: preview.appIcon?.toDataURL() || null,
          }),
        );
      }
    } else if (platform === 'darwin') {
      for (const native of catalog.sources) {
        if (!['display', 'window'].includes(native.kind) || ownIds.has(native.id)) continue;
        const kind = native.kind === 'display' ? 'screen' : 'window';
        const display =
          kind === 'screen' ? screen.getAllDisplays().find((entry) => String(entry.id) === native.displayId) : null;
        const format = native.capabilities?.formats?.find((entry) => entry.width > 0);
        sources.push(
          sourceDescription(native.id, kind, native.label, format, {
            displayId: native.displayId,
            bounds: display ? validBounds(display.bounds) : undefined,
          }),
        );
      }
      // Share the bounded native-preview service. Missing previews remain explicit.
      let index = 0;
      const worker = async () => {
        while (index < sources.length) {
          const source = sources[index++];
          const preview = await getNativePreview({ sourceId: source.id });
          source.thumbnail = preview.thumbnail;
        }
      };
      await Promise.all([worker(), worker()]);
    } else throw new Error('Source selection is unavailable on this platform');
    return sources;
  };
  const preview = async (source, raise) => {
    let bounds = source.bounds;
    let warning = null;
    if (source.kind === 'window') {
      const target = await requestNative('window-selection-preview', {
        source: source.id,
        raise,
      });
      bounds = validBounds(target.bounds);
      if (platform === 'win32') bounds = validBounds(screen.screenToDipRect(null, bounds));
      warning = target.raiseError || null;
    }
    if (!bounds) throw new Error('The selected display is no longer available');
    let thumbnail;
    if (platform === 'darwin') thumbnail = (await getNativePreview({ sourceId: source.id, refresh: true })).thumbnail;
    else {
      const refreshed = await refreshThumbnails();
      const selected = refreshed.find((entry) =>
        source.kind === 'window'
          ? windowSourceId(entry.id, platform) === source.id
          : entry.id.startsWith('screen:') &&
            screen
              .getAllDisplays()
              .some(
                (display) =>
                  String(display.id) === entry.display_id &&
                  display.bounds.x === bounds.x &&
                  display.bounds.y === bounds.y,
              ),
      );
      if (!selected) throw new Error('The capture source is no longer available');
      thumbnail = selected.thumbnail.toDataURL();
    }
    return { bounds, thumbnail, warning };
  };
  return { development: false, list, preview };
}

module.exports = {
  createNativeSourceProvider,
  sourceDescription,
  windowSourceId,
  validBounds,
};
