import type { HtmlThumbnailWorker } from './html-thumbnail-types';

/** All pixel decoding/resizing stays in the worker; hosts provide only a frozen-source capability. */
export function createHtmlThumbnailClient(worker: HtmlThumbnailWorker, source: () => Promise<string>) {
  let nextId = 0,
    disposed = false;
  let url: Promise<string> | undefined;
  const pending = new Map<number, { resolve(blob: Blob): void; reject(error: Error): void }>();
  const fail = (error: Error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  worker.onmessage = ({ data }) => {
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if ('error' in data) request.reject(new Error(data.error));
    else request.resolve(data.blob);
  };
  worker.onerror = () => {
    disposed = true;
    fail(new Error('HTML thumbnail worker failed.'));
    worker.terminate();
  };
  return {
    async render(timeMs: number, width: number, height: number) {
      if (disposed) throw new Error('HTML thumbnail source has stopped.');
      url ??= source().catch((error) => {
        url = undefined;
        throw error;
      });
      const capability = await url;
      if (disposed) throw new Error('HTML thumbnail source has stopped.');
      const id = ++nextId;
      return new Promise<Blob>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try {
          worker.postMessage({ id, url: capability, timeMs, width, height });
        } catch (error) {
          pending.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      fail(new Error('HTML thumbnail source has stopped.'));
    },
  };
}
