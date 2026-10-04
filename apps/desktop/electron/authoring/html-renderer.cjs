const { randomBytes } = require('node:crypto');

/** Sandboxed code surfaces. Only frozen bundle files are reachable; no Beam preload is installed. */
function createHtmlRenderer({ BrowserWindow, session, files, origin }) {
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
  const keyFor = (context, html) => `${context.projectId}:${html.id}:${html.revision}`;
  const destroy = (surface) => {
    if (surfaces.get(surface.key) === surface) surfaces.delete(surface.key);
    capabilities.delete(surface.token);
    if (!surface.window.isDestroyed()) surface.window.destroy();
  };
  const createSurface = (context, html) => {
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
      width: html.width,
      height: html.height,
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
      },
    });
    const surface = { key: keyFor(context, html), context, html, token, window, queue: Promise.resolve(), pending: 0 };
    capabilities.set(token, surface);
    surfaces.set(surface.key, surface);
    const contents = window.webContents;
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
    return surface;
  };
  const capture = async (context, html, timeMs) => {
    if (!Number.isFinite(timeMs) || timeMs < 0) throw new Error('Frame time is outside the HTML composition.');
    timeMs = html.durationMs === 0 ? 0 : Math.min(timeMs, html.durationMs);
    const surface = surfaces.get(keyFor(context, html)) || createSurface(context, html);
    surface.pending++;
    const render = async () => {
      let timer;
      try {
        return await Promise.race([
          (async () => {
            await surface.loaded;
            if (surface.error) throw surface.error;
            await surface.window.webContents.executeJavaScript(
              `(async () => {
              const composition = window.beamComposition;
              if (${html.durationMs} > 0 && typeof composition?.seek !== 'function')
                throw new Error('Animated HTML must expose window.beamComposition.seek(timeMs).');
              if (composition?.ready) await composition.ready;
              if (composition?.seek) await composition.seek(${timeMs});
              await document.fonts.ready;
              await Promise.all(Array.from(document.images, image => image.decode()));
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            })()`,
              true,
            );
            if (surface.error) throw surface.error;
            const pixels = await surface.window.webContents.capturePage(
              { x: 0, y: 0, width: html.width, height: html.height },
              { stayHidden: true, stayAwake: true },
            );
            if (pixels.isEmpty()) throw new Error('HTML capture returned an empty frame.');
            const size = pixels.getSize();
            return (
              size.width === html.width && size.height === html.height
                ? pixels
                : pixels.resize({ width: html.width, height: html.height })
            ).toPNG();
          })(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('HTML frame timed out.')), 20000);
          }),
        ]);
      } catch (error) {
        destroy(surface);
        throw error;
      } finally {
        clearTimeout(timer);
      }
    };
    const result = surface.queue.then(render);
    surface.queue = result.then(
      () => undefined,
      () => undefined,
    );
    try {
      return await result;
    } finally {
      surface.pending--;
    }
  };
  return {
    capture,
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
module.exports = { createHtmlRenderer };
