import type { FrameSource } from './frame-source-types';

/** The same provider can supply preview or offline composition rendering. Each frame has explicit ownership. */
export function createHttpFrameSource(endpoint: string): FrameSource {
  const base = new URL(endpoint, globalThis.location.href);
  if (!['http:', 'https:'].includes(base.protocol)) throw new TypeError('Frame source requires HTTP.');
  return {
    async frameAt(timeMs, signal) {
      if (!Number.isFinite(timeMs) || timeMs < 0) throw new TypeError('Invalid frame time.');
      signal.throwIfAborted();
      const url = new URL(base);
      url.searchParams.set('timeMs', String(timeMs));
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Frame source failed: HTTP ${response.status}.`);
      const bitmap = await createImageBitmap(await response.blob());
      if (signal.aborted) {
        bitmap.close();
        signal.throwIfAborted();
      }
      let closed = false;
      return {
        media: { source: bitmap, width: bitmap.width, height: bitmap.height },
        close() {
          if (!closed) {
            closed = true;
            bitmap.close();
          }
        },
      };
    },
  };
}
