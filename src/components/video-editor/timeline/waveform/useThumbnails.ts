import { ref, onUnmounted, reactive, watch, type Ref } from "vue";
import ThumbnailWorker from "./thumbnail.worker?worker&inline";

export function useThumbnails(videoSrcRef: Ref<string | null>) {
  const thumbnails = reactive<Record<number, string>>({});
  const isExtracting = ref(false);

  let worker: Worker | null = null;
  let hiddenVideo: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let canvasCtx: CanvasRenderingContext2D | null = null;
  // Watch videoSrcRef changes and update hiddenVideo src
  watch(videoSrcRef, (newSrc) => {
    if (hiddenVideo && newSrc) {
      hiddenVideo.src = newSrc;
      hiddenVideo.load();
    }
  });

  const initVideoAndCanvas = () => {
    if (!hiddenVideo) {
      hiddenVideo = document.createElement("video");
      hiddenVideo.src = videoSrcRef.value || "";
      hiddenVideo.muted = true;
      hiddenVideo.playsInline = true;
      hiddenVideo.preload = "auto";

      hiddenVideo.addEventListener("loadedmetadata", () => {});

      hiddenVideo.addEventListener("error", (_e) => {
        console.error(
          "[useThumbnails] Hidden video error occurred:",
          hiddenVideo?.error,
        );
      });

      hiddenVideo.addEventListener("stalled", () => {
        console.warn("[useThumbnails] Hidden video loading stalled");
      });
    }

    if (!canvas) {
      canvas = document.createElement("canvas");
      canvasCtx = canvas.getContext("2d");
    }
  };

  const initWorker = () => {
    if (!worker) {
      worker = new ThumbnailWorker();

      worker.onmessage = async (event: MessageEvent) => {
        const { type, time, dataUrl } = event.data;

        if (type === "extract-frame") {
          if (!hiddenVideo || !canvas || !canvasCtx) {
            initVideoAndCanvas();
          }

          try {
            isExtracting.value = true;
            if (hiddenVideo) {
              // Ensure metadata is loaded before any seek attempt
              if (hiddenVideo.readyState < 1) {
                await new Promise<void>((resolve) => {
                  hiddenVideo!.addEventListener(
                    "loadedmetadata",
                    () => resolve(),
                    { once: true },
                  );
                });
              }

              // Set canvas dimensions dynamically for crisp display without heavy startup lag
              const vWidth = hiddenVideo.videoWidth || 320;
              const vHeight = hiddenVideo.videoHeight || 180;
              const targetWidth = Math.min(240, vWidth);
              const targetHeight = Math.round(targetWidth * (vHeight / vWidth));

              if (canvas && (canvas.width !== targetWidth || canvas.height !== targetHeight)) {
                canvas.width = targetWidth;
                canvas.height = targetHeight;
              }

              // Gotcha: if target time is already very close to current time (and not 0), skip seek since 'seeked' might not fire
              if (time > 0 && Math.abs(hiddenVideo.currentTime - time) < 0.05) {
              } else {
                hiddenVideo.currentTime = time;

                // Promise to wait for seek complete with a fast fallback timeout
                await new Promise<void>((resolve) => {
                  let resolved = false;

                  const onSeeked = () => {
                    if (!resolved) {
                      resolved = true;
                      clearTimeout(timeout);
                      resolve();
                    }
                  };

                  const timeout = setTimeout(() => {
                    if (!resolved) {
                      resolved = true;
                      hiddenVideo!.removeEventListener("seeked", onSeeked);
                      resolve();
                    }
                  }, 200);

                  hiddenVideo!.addEventListener("seeked", onSeeked, {
                    once: true,
                  });
                });
              }

              // Draw frame to canvas with fast JPEG compression
              if (canvas && canvasCtx) {
                canvasCtx.imageSmoothingEnabled = true;
                canvasCtx.drawImage(
                  hiddenVideo,
                  0,
                  0,
                  canvas.width,
                  canvas.height,
                );
                const dataUrlResult = canvas.toDataURL("image/jpeg", 0.8);
                worker?.postMessage({
                  type: "frame-response",
                  time,
                  dataUrl: dataUrlResult,
                });
              }
            }
          } catch (e) {
            console.error(
              "[useThumbnails] Failed to extract frame at time:",
              time,
              e,
            );
            worker?.postMessage({
              type: "frame-response",
              time,
              dataUrl: null,
            });
          } finally {
            isExtracting.value = false;
          }
        } else if (type === "frame-ready") {
          thumbnails[time] = dataUrl;
        }
      };
    }
  };

  // Request frames based on virtualized scroll viewport
  const requestVisibleFrames = (visibleTimestamps: number[]) => {
    initWorker();
    worker?.postMessage({
      type: "request-frames",
      visibleTimes: visibleTimestamps,
    });
  };

  const clearCache = () => {
    worker?.postMessage({ type: "clear" });
    Object.keys(thumbnails).forEach((key) => {
      delete thumbnails[Number(key)];
    });
  };

  onUnmounted(() => {
    if (worker) {
      worker.terminate();
    }
    if (hiddenVideo) {
      hiddenVideo.remove();
    }
  });

  return {
    thumbnails,
    isExtracting,
    requestVisibleFrames,
    clearCache,
  };
}
