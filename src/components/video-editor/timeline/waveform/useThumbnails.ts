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
      canvas.width = 120; // low resolution thumbnails for fast performance
      canvas.height = 68; // 16:9 aspect ratio roughly
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

              // Gotcha: if target time is already very close to current time, skip seek since 'seeked' might not fire
              if (Math.abs(hiddenVideo.currentTime - time) < 0.05) {
              } else {
                hiddenVideo.currentTime = time;

                // Promise to wait for seek complete with a fallback timeout
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
                      console.warn(
                        "[useThumbnails] Seek timed out for time:",
                        time,
                      );
                      resolve();
                    }
                  }, 500);

                  hiddenVideo!.addEventListener("seeked", onSeeked, {
                    once: true,
                  });
                });
              }

              // Draw frame to low-res canvas
              if (canvas) {
                canvasCtx?.drawImage(
                  hiddenVideo,
                  0,
                  0,
                  canvas.width,
                  canvas.height,
                );
                const dataUrlResult = canvas.toDataURL("image/jpeg", 0.6); // low quality for performance

                // Return to worker
                console.log(
                  "[useThumbnails] Sending frame response to worker for time:",
                  time,
                );
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
    console.log(
      "[useThumbnails] Requesting visible frames from worker:",
      visibleTimestamps,
    );
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
