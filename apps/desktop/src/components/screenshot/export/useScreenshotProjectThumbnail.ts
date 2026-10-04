import { onBeforeUnmount, watch } from 'vue';
import { capture } from '~/api/capture';
import { encodeScreenshot } from './screenshot-export';
import type { ScreenshotThumbnailHost } from './screenshot-thumbnail-types';

const stateHash = async (json: string) => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

/** Background renders own their worker and never share the clipboard export cache. */
export function useScreenshotProjectThumbnail(host: ScreenshotThumbnailHost) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  let controller: AbortController | undefined;
  let revision = 0;
  let savedKey: string | undefined;
  let disposed = false;
  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const update = async (force: boolean) => {
    const document = host.document.value,
      state = host.state.value;
    if (disposed || !document || !state || (!force && host.blocked())) return;
    const json = JSON.stringify(state),
      key = `${document.id}:${document.source}:${json}`;
    if (key === savedKey) return;
    const current = revision;
    const abort = new AbortController();
    controller = abort;
    const snapshot = JSON.parse(json) as typeof state;
    const scale = Math.min(1, 480 / snapshot.canvas.width, 270 / snapshot.canvas.height);
    const jobs = [
      Promise.resolve().then(host.save),
      stateHash(json),
      encodeScreenshot(
        document.source,
        { ...snapshot, format: 'webp', quality: 0.8 },
        {
          signal: abort.signal,
          outputSize: {
            width: Math.max(1, Math.round(snapshot.canvas.width * scale)),
            height: Math.max(1, Math.round(snapshot.canvas.height * scale)),
          },
        },
      ),
    ] as const;
    try {
      const [, hash, bytes] = await Promise.all(jobs);
      if (disposed || current !== revision || abort.signal.aborted) return;
      const url = await capture.saveScreenshotThumbnail(document.id, { bytes, stateHash: hash });
      if (url && current === revision) savedKey = key;
    } catch (reason) {
      abort.abort(reason);
      await Promise.allSettled(jobs);
      if (!disposed && current === revision) console.warn('Screenshot project thumbnail update failed.', reason);
    } finally {
      controller = undefined;
    }
  };
  const run = (force = false): Promise<void> => {
    if (active) return active.then(() => run(force));
    active = update(force).finally(() => {
      active = undefined;
    });
    return active;
  };
  watch(
    [host.state, () => host.document.value?.id, host.blocked],
    () => {
      revision++;
      clearTimer();
      controller?.abort(new DOMException('Screenshot thumbnail superseded.', 'AbortError'));
      if (!disposed && host.document.value && host.state.value && !host.blocked())
        timer = setTimeout(() => {
          timer = undefined;
          void run();
        }, 1_000);
    },
    { deep: true, flush: 'sync', immediate: true },
  );
  onBeforeUnmount(() => {
    disposed = true;
    clearTimer();
    controller?.abort(new DOMException('Screenshot thumbnail cancelled.', 'AbortError'));
  });
  return {
    async flush() {
      clearTimer();
      if (active) await active;
      await run(true);
    },
  };
}
