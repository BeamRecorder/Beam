import { ALL_FORMATS, CanvasSink, Input, InputVideoTrack, UrlSource } from 'mediabunny';
import { reactive } from 'vue';

const thumbnailCache = reactive<Record<string, string>>({});
const generatingSet = new Set<string>();
const THUMBNAIL_TIMEOUT_MS = 10_000;

const thumbnailTimestamp = async (track: InputVideoTrack) => {
  const metadataDuration = await track.getDurationFromMetadata();
  const duration = metadataDuration ?? (await track.computeDuration({ skipLiveWait: true }));
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration / 2 : 0.1;
};

const renderThumbnail = async (track: InputVideoTrack) => {
  const timestamp = await thumbnailTimestamp(track);
  const sink = new CanvasSink(track);
  for await (const sample of sink.canvasesAtTimestamps([timestamp])) {
    const source = sample?.canvas;
    if (!source) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = Math.max(1, Math.round((240 * source.height) / Math.max(1, source.width)));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.8);
  }
  return null;
};

async function createThumbnail(videoSrc: string) {
  const input = new Input({ source: new UrlSource(videoSrc), formats: ALL_FORMATS });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const thumbnail = (async () => {
      const track = await input.getPrimaryVideoTrack();
      return track ? await renderThumbnail(track) : null;
    })();
    return await Promise.race([
      thumbnail,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), THUMBNAIL_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    input.dispose();
  }
}

export function useProjectThumbnailGenerator() {
  const generateThumbnail = async (projectId: string, videoSrc: string): Promise<string | null> => {
    if (!videoSrc || thumbnailCache[projectId]) return thumbnailCache[projectId] ?? null;
    if (generatingSet.has(projectId)) return null;
    generatingSet.add(projectId);
    try {
      const dataUrl = await createThumbnail(videoSrc);
      if (!dataUrl) return null;
      thumbnailCache[projectId] = dataUrl;
      try {
        const savedUrl = await window.capture?.saveProjectThumbnail?.(projectId, dataUrl);
        if (savedUrl) thumbnailCache[projectId] = savedUrl;
      } catch {
        // The generated in-memory thumbnail remains usable when persistence fails.
      }
      return dataUrl;
    } catch {
      return null;
    } finally {
      generatingSet.delete(projectId);
    }
  };

  return { thumbnailCache, generateThumbnail };
}
