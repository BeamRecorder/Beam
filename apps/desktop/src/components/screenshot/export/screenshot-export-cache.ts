import { encodeScreenshot } from './screenshot-export';
import type { ScreenshotExportCacheEntry, ScreenshotExporter } from './screenshot-export-types';

const MAX_CACHED_BYTES = 16 * 1024 * 1024;

/** One editor owns one immutable encoded result; any document/format change invalidates it. */
export function createScreenshotExporter(): ScreenshotExporter {
  let cache: ScreenshotExportCacheEntry | undefined;
  let active: AbortController | undefined;
  let disposed = false;
  return {
    async encode(source, state, { signal } = {}) {
      if (disposed) throw new Error('Screenshot exporter is disposed.');
      signal?.throwIfAborted();
      if (active) throw new Error('Another screenshot export is active.');
      const snapshot = structuredClone(state);
      const key = JSON.stringify([source, snapshot]);
      if (cache?.key === key) return cache.bytes.slice(0);
      cache = undefined;
      const controller = new AbortController();
      const abort = () => controller.abort(signal!.reason);
      signal?.addEventListener('abort', abort, { once: true });
      active = controller;
      try {
        const bytes = await encodeScreenshot(source, snapshot, { signal: controller.signal });
        controller.signal.throwIfAborted();
        if (!disposed && !controller.signal.aborted && bytes.byteLength <= MAX_CACHED_BYTES)
          cache = { key, bytes: bytes.slice(0) };
        return bytes;
      } finally {
        signal?.removeEventListener('abort', abort);
        active = undefined;
      }
    },
    dispose() {
      disposed = true;
      cache = undefined;
      active?.abort(new DOMException('Screenshot export cancelled.', 'AbortError'));
    },
  };
}
