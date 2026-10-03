const { randomBytes } = require('node:crypto');

/** Sandboxed code surfaces. Only frozen bundle files are reachable; no Beam preload is installed. */
function createHtmlSurfaces({ BrowserWindow, session, files, origin }) {
  const surfaces = new Map();
  const capabilities = new Map();
  const partition = `beam-html-${process.pid}-${randomBytes(8).toString('hex')}`;
  const isolated = session.fromPartition(partition);
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolated.setPermissionCheckHandler(() => false);
  isolated.webRequest.onBeforeRequest((details, callback) => {
    const allowed = [...capabilities.keys()].some((token) => details.url.startsWith(`${origin()}/html/${token}/`));
    callback({ cancel: !allowed && !details.url.startsWith('data:') && !details.url.startsWith('blob:') });
  });
  let disposed = false;
  const keyFor = (context, html, scale) => `${context.projectId}:${html.id}:${html.revision}:${scale}`;
  const destroy = (surface) => {
    if (surfaces.get(surface.key) === surface) surfaces.delete(surface.key);
    capabilities.delete(surface.token);
    if (!surface.window.isDestroyed()) surface.window.destroy();
  };
  const createSurface = (context, html, scale) => {
    if (disposed) throw new Error('HTML renderer has stopped.');
    files.fileFor(context, html, html.entry);
    // Sequential frames use at most four native surfaces, including reverse seeks and source revisions.
    if (surfaces.size >= 4) {
      const unused = [...surfaces.values()].find((surface) => !surface.pending);
      if (!unused) throw new Error('HTML renderer is busy; retry after the current frame.');
      destroy(unused);
    }
    const token = randomBytes(32).toString('hex');
    const window = new BrowserWindow({
      width: Math.max(1, Math.round(html.width * scale)),
      height: Math.max(1, Math.round(html.height * scale)),
      useContentSize: true,
      show: false,
      transparent: true,
      frame: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        paintWhenInitiallyHidden: true,
        webSecurity: true,
        zoomFactor: scale,
      },
    });
    const surface = {
      key: keyFor(context, html, scale),
      context,
      html,
      token,
      window,
      queue: Promise.resolve(),
      pending: 0,
      width: Math.max(1, Math.round(html.width * scale)),
      height: Math.max(1, Math.round(html.height * scale)),
    };
    capabilities.set(token, surface);
    surfaces.set(surface.key, surface);
    const contents = window.webContents;
    // Chromium clamps zoom below 25%; each surface must retain its own zoom across navigation.
    contents.setZoomMode('isolated');
    contents.setZoomFactor(scale);
    contents.setAudioMuted(true);
    contents.on('console-message', (details) => {
      if (details.level === 'error') surface.error = new Error(`HTML composition: ${details.message}`);
    });
    contents.on('render-process-gone', (_event, details) => {
      surface.error = new Error(`HTML renderer exited: ${details.reason}`);
    });
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event) => event.preventDefault());
    contents.on('will-redirect', (event) => event.preventDefault());
    surface.loaded = window.loadURL(`${origin()}/html/${token}/${html.entry}`);
    // A failed load may precede the first capture await.
    surface.loaded.catch(() => {});
    surface.ready = surface.loaded.then(() =>
      contents.executeJavaScript(
        `(async () => {
      if (window.beamComposition?.ready) await window.beamComposition.ready;
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, image => image.decode()));
    })()`,
        true,
      ),
    );
    surface.ready.catch(() => {});
    return surface;
  };
  return {
    surfaceFor(context, html, width) {
      if (disposed) throw new Error('HTML renderer has stopped.');
      if (width !== undefined && ![240, 480, 960].includes(width)) throw new Error('Invalid HTML thumbnail width.');
      const scale = width === undefined ? 1 : Math.max(0.25, Math.min(1, width / html.width));
      return surfaces.get(keyFor(context, html, scale)) || createSurface(context, html, scale);
    },
    destroy,
    bundleFile(token, relative) {
      const surface = capabilities.get(token);
      return surface ? files.fileFor(surface.context, surface.html, relative) : null;
    },
    dispose() {
      disposed = true;
      for (const surface of [...surfaces.values()]) destroy(surface);
    },
  };
}
module.exports = { createHtmlSurfaces };
