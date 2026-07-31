import { reactive } from "vue";

const thumbnailCache = reactive<Record<string, string>>({});

export function useProjectThumbnailGenerator() {
  const generateThumbnail = async (projectId: string, videoSrc: string): Promise<string | null> => {
    if (thumbnailCache[projectId]) {
      return thumbnailCache[projectId];
    }

    const tempVideo = document.createElement("video");
    tempVideo.muted = true;
    tempVideo.playsInline = true;
    tempVideo.preload = "metadata";

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = 240;
    tempCanvas.height = 135;
    const ctx = tempCanvas.getContext("2d");

    if (!ctx) return null;

    try {
      tempVideo.src = videoSrc;
      tempVideo.load();

      await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, 600);
        const onLoaded = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        tempVideo.addEventListener("loadedmetadata", onLoaded, { once: true });
        tempVideo.addEventListener("error", onLoaded, { once: true });
      });

      if (tempVideo.readyState >= 1) {
        const midTime = Number.isFinite(tempVideo.duration) && tempVideo.duration > 0 ? tempVideo.duration / 2 : 0.1;
        tempVideo.currentTime = midTime;

        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(resolve, 500);
          const onSeeked = () => {
            window.clearTimeout(timeout);
            resolve();
          };
          tempVideo.addEventListener("seeked", onSeeked, { once: true });
        });
      }

      if (tempVideo.readyState >= 1) {
        ctx.drawImage(tempVideo, 0, 0, tempCanvas.width, tempCanvas.height);
        const dataUrl = tempCanvas.toDataURL("image/webp", 0.75);
        thumbnailCache[projectId] = dataUrl;

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
      tempVideo.pause();
      tempVideo.src = "";
      tempVideo.remove();
    }

    return null;
  };

  return {
    thumbnailCache,
    generateThumbnail,
  };
}
