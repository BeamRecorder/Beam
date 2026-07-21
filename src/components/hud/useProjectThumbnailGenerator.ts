import { ref, reactive, onUnmounted } from "vue";

const thumbnailCache = reactive<Record<string, string>>({});
const isProcessing = ref(false);

export function useProjectThumbnailGenerator() {
  let videoEl: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let canvasCtx: CanvasRenderingContext2D | null = null;

  const initElements = () => {
    if (!videoEl) {
      videoEl = document.createElement("video");
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.preload = "auto";
    }
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = 240; // low resolution thumbnail for speed and memory efficiency
      canvas.height = 135;
      canvasCtx = canvas.getContext("2d");
    }
  };

  const generateThumbnail = async (projectId: string, videoSrc: string): Promise<string | null> => {
    if (thumbnailCache[projectId]) {
      return thumbnailCache[projectId];
    }

    initElements();
    if (!videoEl || !canvas || !canvasCtx) return null;

    try {
      isProcessing.value = true;
      videoEl.src = videoSrc;
      videoEl.load();

      await new Promise<void>((resolve, reject) => {
        let timeout: number;
        const onLoadedMetadata = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        const onError = () => {
          window.clearTimeout(timeout);
          reject(new Error("Video load failed"));
        };

        timeout = window.setTimeout(() => {
          videoEl?.removeEventListener("loadedmetadata", onLoadedMetadata);
          videoEl?.removeEventListener("error", onError);
          resolve();
        }, 1000);

        videoEl!.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
        videoEl!.addEventListener("error", onError, { once: true });
      });

      if (videoEl.readyState >= 1) {
        const midTime = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration / 2 : 0.1;
        videoEl.currentTime = midTime;

        await new Promise<void>((resolve) => {
          let timeout: number;
          const onSeeked = () => {
            window.clearTimeout(timeout);
            resolve();
          };
          timeout = window.setTimeout(resolve, 600);
          videoEl!.addEventListener("seeked", onSeeked, { once: true });
        });

        canvasCtx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/webp", 0.75);
        thumbnailCache[projectId] = dataUrl;

        // Persist thumbnail directly to project folder via Electron IPC so it stays saved forever
        if (typeof window !== "undefined" && window.capture?.saveProjectThumbnail) {
          try {
            const savedUrl = await window.capture.saveProjectThumbnail(projectId, dataUrl);
            if (savedUrl) thumbnailCache[projectId] = savedUrl;
          } catch (e) {
            console.debug("Failed to persist thumbnail to disk:", e);
          }
        }
        return dataUrl;
      }
    } catch (err) {
      console.debug("Failed to extract thumbnail for project", projectId, err);
    } finally {
      isProcessing.value = false;
    }

    return null;
  };

  onUnmounted(() => {
    if (videoEl) {
      videoEl.pause();
      videoEl.src = "";
      videoEl = null;
    }
  });

  return {
    thumbnailCache,
    generateThumbnail,
  };
}
