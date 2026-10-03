const { createHtmlSurfaces } = require('./html-surfaces.cjs');

/** Deterministic HTML capture, shared by preview, thumbnails and exact exports. */
function createHtmlRenderer(options) {
  const pool = createHtmlSurfaces(options);
  const capture = async (context, html, timeMs, thumbnailWidth) => {
    if (!Number.isFinite(timeMs) || timeMs < 0) throw new Error('Frame time is outside the HTML composition.');
    timeMs = html.durationMs === 0 ? 0 : Math.min(timeMs, html.durationMs);
    const surface = pool.surfaceFor(context, html, thumbnailWidth);
    surface.frames ??= new Map();
    surface.frameBytes ??= 0;
    surface.pending++;
    const render = async () => {
      let timer;
      try {
        if (surface.error) throw surface.error;
        const cached = surface.frames.get(timeMs);
        if (cached) {
          surface.frames.delete(timeMs);
          surface.frames.set(timeMs, cached);
          return cached;
        }
        return await Promise.race([
          (async () => {
            await surface.ready;
            if (surface.error) throw surface.error;
            await surface.window.webContents.executeJavaScript(
              `(async () => {
              const composition = window.beamComposition;
              if (${html.durationMs} > 0 && typeof composition?.seek !== 'function')
                throw new Error('Animated HTML must expose window.beamComposition.seek(timeMs).');
              if (composition?.seek) await composition.seek(${timeMs});
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            })()`,
              true,
            );
            if (surface.error) throw surface.error;
            const pixels = await surface.window.webContents.capturePage(
              { x: 0, y: 0, width: surface.width, height: surface.height },
              { stayHidden: true, stayAwake: true },
            );
            if (pixels.isEmpty()) throw new Error('HTML capture returned an empty frame.');
            const size = pixels.getSize();
            const bytes = (
              size.width === surface.width && size.height === surface.height
                ? pixels
                : pixels.resize({ width: surface.width, height: surface.height })
            ).toPNG();
            // Revisited seeks reuse exact pixels; export and long timelines stay bounded.
            if (bytes.byteLength <= 32 * 1024 * 1024) {
              while (surface.frames.size >= 8 || surface.frameBytes + bytes.byteLength > 32 * 1024 * 1024) {
                const [time, frame] = surface.frames.entries().next().value;
                surface.frames.delete(time);
                surface.frameBytes -= frame.byteLength;
              }
              surface.frames.set(timeMs, bytes);
              surface.frameBytes += bytes.byteLength;
            }
            return bytes;
          })(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('HTML frame timed out.')), 20000);
          }),
        ]);
      } catch (error) {
        pool.destroy(surface);
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
    bundleFile: pool.bundleFile,
    dispose: pool.dispose,
  };
}
module.exports = { createHtmlRenderer };
