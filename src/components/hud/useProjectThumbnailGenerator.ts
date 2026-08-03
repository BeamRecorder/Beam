import { reactive } from "vue";

const thumbnailCache = reactive<Record<string, string>>({});
const generatingSet = new Set<string>();

export function useProjectThumbnailGenerator() {
  const generateThumbnail = async (projectId: string, videoSrc: string): Promise<string | null> => {
    if (!videoSrc || thumbnailCache[projectId]) {
      return thumbnailCache[projectId] ?? null;
    }
    if (generatingSet.has(projectId)) {
      return null;
    }
    generatingSet.add(projectId);

    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.preload = "metadata";
      video.src = videoSrc;

      let resolved = false;
      const finish = (url: string | null) => {
        generatingSet.delete(projectId);
        if (resolved) return;
        resolved = true;
        video.onloadeddata = null;
        video.onseeked = null;
        video.onerror = null;
        video.src = "";
        video.load();
        resolve(url);
      };

      const timeout = setTimeout(() => finish(null), 3000);

      video.onloadeddata = () => {
        const targetTime = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(1, video.duration / 2) : 0.1;
        video.currentTime = targetTime;
      };

      video.onseeked = async () => {
        clearTimeout(timeout);
        try {
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = 240;
          tempCanvas.height = Math.round((240 * (video.videoHeight || 135)) / (video.videoWidth || 240));
          const ctx = tempCanvas.getContext("2d");

          if (ctx) {
            ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
            const dataUrl = tempCanvas.toDataURL("image/webp", 0.8);
            thumbnailCache[projectId] = dataUrl;

            if (typeof window !== "undefined" && window.capture?.saveProjectThumbnail) {
              try {
                const savedUrl = await window.capture.saveProjectThumbnail(projectId, dataUrl);
                if (savedUrl) thumbnailCache[projectId] = savedUrl;
              } catch {
                // Ignored
              }
            }
            finish(dataUrl);
            return;
          }
        } catch {
          // Ignored
        }
        finish(null);
      };

      video.onerror = () => finish(null);
    });
  };

  return {
    thumbnailCache,
    generateThumbnail,
  };
}
