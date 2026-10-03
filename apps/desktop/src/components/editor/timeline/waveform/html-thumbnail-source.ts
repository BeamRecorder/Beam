import { reactive, ref } from 'vue';
import { thumbnailWidthFor, THUMBNAIL_WIDTH } from '@beam/runtime/playback/thumbnail-protocol';
import type { HtmlComposition } from '@beam/engine/html/html-types';
import type { MediaProcessingReporter } from '../../performance/media-processing-pressure';
import type { HtmlThumbnailServices } from './html-thumbnail-types';

import { createHtmlThumbnailServices } from './html-thumbnail-services';

/** HTML is sampled at source time. It is not a video container for Mediabunny to decode. */
export function createHtmlThumbnailSource(
  html: HtmlComposition,
  pressure: MediaProcessingReporter,
  services: HtmlThumbnailServices = createHtmlThumbnailServices(html),
) {
  const thumbnails = reactive<Record<number, string>>({});
  const widths = reactive<Record<number, number>>({});
  const isExtracting = ref(false),
    error = ref<string | null>(null);
  const cache = new Map<number, string>();
  let desired: number[] = [],
    width = THUMBNAIL_WIDTH,
    running = false,
    suspended = false,
    interactive = false,
    disposed = false,
    generation = 0;
  let nextCaptureAt = 0;
  let wake: ReturnType<typeof setTimeout> | undefined;
  const targetWidth = () => (interactive ? THUMBNAIL_WIDTH : width);
  const pending = () => desired.filter((time) => (widths[time] ?? 0) < targetWidth());
  const cancelWake = () => {
    clearTimeout(wake);
    wake = undefined;
  };
  const updatePressure = () => {
    if (!disposed) pressure.update(running ? 1 : 0, pending().length);
  };
  const remove = (time: number) => {
    services.revokeUrl(cache.get(time)!);
    cache.delete(time);
    delete thumbnails[time];
    delete widths[time];
  };
  const pump = async () => {
    if (running || suspended || disposed || error.value) return;
    cancelWake();
    if (!pending().length) return;
    // Absolute spacing survives repeated seeks and viewport updates. Never queue a burst.
    const delay = interactive ? nextCaptureAt - Date.now() : 0;
    if (delay > 0) {
      wake = setTimeout(() => void pump(), delay);
      return;
    }
    running = true;
    isExtracting.value = true;
    updatePressure();
    let requestGeneration = generation;
    try {
      while (!disposed && !suspended) {
        if (interactive && Date.now() < nextCaptureAt) break;
        const time = pending()[0];
        if (time === undefined) break;
        requestGeneration = generation;
        const requestedWidth = targetWidth();
        nextCaptureAt = Date.now() + 250;
        const timeMs = Math.min(html.durationMs, (Math.floor(time * html.fps) * 1000) / html.fps);
        const blob = await services.render(timeMs, requestedWidth);
        if (disposed || requestGeneration !== generation || !desired.includes(time)) continue;
        if (cache.has(time)) remove(time);
        while (cache.size >= 96) remove(cache.keys().next().value!);
        const url = services.createUrl(blob);
        cache.set(time, url);
        thumbnails[time] = url;
        widths[time] = requestedWidth;
        updatePressure();
      }
    } catch (cause) {
      if (!disposed && requestGeneration === generation) {
        error.value = String(cause);
        pressure.error();
      }
    } finally {
      running = false;
      isExtracting.value = false;
      updatePressure();
      // Continue through paced jobs and cache resets, including obsolete render failures.
      void pump();
    }
  };
  const clearCache = () => {
    generation++;
    cancelWake();
    desired = [];
    for (const time of cache.keys()) remove(time);
    error.value = null;
    updatePressure();
  };
  return {
    thumbnails,
    widths,
    isExtracting,
    error,
    setActivity(paused: boolean, active: boolean) {
      suspended = paused;
      interactive = active;
      cancelWake();
      updatePressure();
      void pump();
    },
    requestVisibleFrames(times: number[], requestedWidth = THUMBNAIL_WIDTH) {
      if (disposed) return;
      desired = [...new Set(times.filter((time) => Number.isFinite(time) && time >= 0))].slice(0, 96);
      width = thumbnailWidthFor(requestedWidth);
      updatePressure();
      void pump();
    },
    clearCache,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearCache();
      services.dispose();
      pressure.dispose();
    },
  };
}
