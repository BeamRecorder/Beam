import { onUnmounted, reactive, ref, watch, type Ref } from "vue";
import ThumbnailWorker from "./thumbnail.worker?worker&inline";

const CACHE_LIMIT = 180;
const THUMBNAIL_WIDTH = 240;

export function useThumbnails(videoSrcRef: Ref<string | null>) {
  const thumbnails = reactive<Record<number, string>>({});
  const isExtracting = ref(false);
  const cacheOrder: number[] = [];
  let worker: Worker | null = null;
  let hiddenVideo: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let context: CanvasRenderingContext2D | null = null;

  const clearCache = () => {
    worker?.postMessage({ type: "clear" });
    for (const [time, url] of Object.entries(thumbnails)) {
      URL.revokeObjectURL(url);
      delete thumbnails[Number(time)];
    }
    cacheOrder.length = 0;
  };

  const cacheThumbnail = (time: number, blob: Blob) => {
    const existing = thumbnails[time];
    if (existing) URL.revokeObjectURL(existing);
    thumbnails[time] = URL.createObjectURL(blob);
    cacheOrder.push(time);
    while (cacheOrder.length > CACHE_LIMIT) {
      const expired = cacheOrder.shift();
      if (expired === undefined) break;
      URL.revokeObjectURL(thumbnails[expired]);
      delete thumbnails[expired];
    }
  };

  const initMedia = () => {
    if (!hiddenVideo) {
      hiddenVideo = document.createElement("video");
      hiddenVideo.muted = true;
      hiddenVideo.playsInline = true;
      hiddenVideo.preload = "auto";
      hiddenVideo.src = videoSrcRef.value ?? "";
    }
    if (!canvas) {
      canvas = document.createElement("canvas");
      context = canvas.getContext("2d", { alpha: false });
    }
  };

  const waitFor = (video: HTMLVideoElement, event: "loadedmetadata" | "seeked") =>
    new Promise<void>((resolve) => {
      if (event === "loadedmetadata" && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        resolve();
        return;
      }
      let timeout = 0;
      const done = () => {
        clearTimeout(timeout);
        video.removeEventListener(event, done);
        resolve();
      };
      timeout = window.setTimeout(done, event === "seeked" ? 700 : 2_500);
      video.addEventListener(event, done, { once: true });
    });

  const extractFrame = async (time: number) => {
    initMedia();
    if (!hiddenVideo || !canvas || !context) return;
    try {
      isExtracting.value = true;
      await waitFor(hiddenVideo, "loadedmetadata");
      if (Math.abs(hiddenVideo.currentTime - time) >= 0.05 || time === 0) {
        hiddenVideo.currentTime = Math.min(time, Math.max(0, hiddenVideo.duration - 0.01));
        await waitFor(hiddenVideo, "seeked");
      }
      const width = Math.min(THUMBNAIL_WIDTH, hiddenVideo.videoWidth || THUMBNAIL_WIDTH);
      const height = Math.max(1, Math.round(width * ((hiddenVideo.videoHeight || 180) / (hiddenVideo.videoWidth || 320))));
      canvas.width = width;
      canvas.height = height;
      context.drawImage(hiddenVideo, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas?.toBlob(resolve, "image/jpeg", 0.72));
      worker?.postMessage({ type: "frame-response", time, blob });
    } catch {
      worker?.postMessage({ type: "frame-response", time, blob: null });
    } finally {
      isExtracting.value = false;
    }
  };

  const initWorker = () => {
    if (worker) return;
    worker = new ThumbnailWorker();
    worker.onmessage = (event: MessageEvent) => {
      const { type, time, blob } = event.data;
      if (type === "extract-frame") void extractFrame(time);
      if (type === "frame-ready" && blob) cacheThumbnail(time, blob as Blob);
    };
  };

  const requestVisibleFrames = (visibleTimes: number[]) => {
    if (!videoSrcRef.value || visibleTimes.length === 0) return;
    initWorker();
    worker?.postMessage({ type: "request-frames", visibleTimes });
  };

  watch(videoSrcRef, (source) => {
    clearCache();
    if (!hiddenVideo) return;
    hiddenVideo.src = source ?? "";
    hiddenVideo.load();
  });

  onUnmounted(() => {
    clearCache();
    worker?.terminate();
    hiddenVideo?.remove();
  });

  return { thumbnails, isExtracting, requestVisibleFrames, clearCache };
}
