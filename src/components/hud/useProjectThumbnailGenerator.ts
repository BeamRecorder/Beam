import { reactive } from "vue";
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";

const thumbnailCache = reactive<Record<string, string>>({});

export function useProjectThumbnailGenerator() {
  const generateThumbnail = async (projectId: string, videoSrc: string): Promise<string | null> => {
    if (!videoSrc || thumbnailCache[projectId]) {
      return thumbnailCache[projectId] ?? null;
    }

    let input: Input | null = null;
    try {
      const response = await fetch(videoSrc);
      if (!response.ok) return null;

      const blob = await response.blob();
      input = new Input({
        source: new BlobSource(blob),
        formats: ALL_FORMATS,
      });

      const track = await input.getPrimaryVideoTrack();
      if (!track) return null;

      const duration = (await track.getDurationFromMetadata()) ?? (await track.computeDuration()) ?? 0;
      const sink = new CanvasSink(track, { width: 240 });
      const targetTime = Number.isFinite(duration) && duration > 0 ? duration / 2 : 0.1;

      for await (const wrappedCanvas of sink.canvasesAtTimestamps([targetTime])) {
        if (!wrappedCanvas?.canvas) continue;
        const canvas = wrappedCanvas.canvas;

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = 240;
        tempCanvas.height = Math.round((240 * (canvas.height || 135)) / (canvas.width || 240));
        const ctx = tempCanvas.getContext("2d");

        if (!ctx) continue;
        ctx.drawImage(canvas as CanvasImageSource, 0, 0, tempCanvas.width, tempCanvas.height);
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
        return dataUrl;
      }
    } catch {
      // Ignored
    } finally {
      input?.dispose();
    }

    return null;
  };

  return {
    thumbnailCache,
    generateThumbnail,
  };
}
