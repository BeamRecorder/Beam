const { createHtmlPlaybackController } = require('../../../../packages/runtime/src/html/playback-controller.cjs');

/** Runs inside an opaque-origin iframe, without any Beam preload or native capability. */
function previewRuntime(previewId, createPlayback) {
  const send = (type, details = {}) =>
    parent.postMessage({ channel: 'beam-html-preview', previewId, type, ...details }, '*');
  const report = (error) => send('error', { message: error instanceof Error ? error.message : String(error) });
  const playback = createPlayback({ seek: (time) => window.beamComposition.seek(time), failed: report });
  const fail = (error) => {
    playback.dispose();
    report(error);
  };
  addEventListener('message', (event) => {
    const data = event.data;
    if (
      event.source !== parent ||
      data?.channel !== 'beam-html-preview' ||
      data.previewId !== previewId ||
      data.type !== 'seek' ||
      !Number.isFinite(data.timeMs) ||
      data.timeMs < 0
    )
      return;
    playback.seek(data.timeMs);
  });
  addEventListener('pagehide', () => playback.dispose(), { once: true });
  addEventListener('error', (event) => fail(event.error ?? event.message));
  addEventListener('unhandledrejection', (event) => fail(event.reason));
  addEventListener(
    'DOMContentLoaded',
    async () => {
      try {
        if (typeof window.beamComposition?.seek !== 'function')
          throw new Error('HTML composition must expose seek(timeMs).');
        await window.beamComposition.ready;
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, (image) => image.decode()));
        // Beam owns soundtrack playback. Embedded media never produces duplicate audio.
        document.querySelectorAll('audio,video').forEach((media) => {
          media.muted = true;
        });
        await playback.start();
        if (playback.state === 'ready') send('ready');
      } catch (error) {
        fail(error);
      }
    },
    { once: true },
  );
}

function htmlPreviewPage(html, previewId) {
  const script = `<script>(${previewRuntime.toString()})(${JSON.stringify(previewId)}, ${createHtmlPlaybackController.toString()});</script>`;
  // Register the bridge before author scripts, including inline HTML compositions.
  return /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (head) => head + script) : script + html;
}

function htmlPreviewHeaders(base) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Content-Security-Policy': `default-src 'none'; script-src ${base} 'unsafe-inline'; style-src ${base} 'unsafe-inline'; img-src ${base} data: blob:; font-src ${base} data:; media-src ${base} blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; sandbox allow-scripts`,
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  };
}

function restrictHtmlPreviewNavigation(contents, origin) {
  const deny = (event) => {
    if (!event.isMainFrame && event.frame?.url.startsWith(`${origin}/preview/`)) event.preventDefault();
  };
  contents.on('will-frame-navigate', deny);
  contents.on('will-redirect', deny);
}

module.exports = { htmlPreviewPage, htmlPreviewHeaders, restrictHtmlPreviewNavigation };
