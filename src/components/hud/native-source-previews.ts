import type { CapturePreview, CaptureSource, DesktopCaptureApi } from '../../api/types/capture-api';

const PREVIEW_CONCURRENCY = 2;
let activePreviews = 0;
const previewWaiters: Array<() => void> = [];

const acquirePreviewSlot = async () => {
  if (activePreviews < PREVIEW_CONCURRENCY) {
    activePreviews++;
    return;
  }
  await new Promise<void>((resolve) => previewWaiters.push(resolve));
};

const withPreviewSlot = async <T>(operation: () => Promise<T>): Promise<T> => {
  await acquirePreviewSlot();
  try {
    return await operation();
  } finally {
    const next = previewWaiters.shift();
    if (next) next();
    else activePreviews--;
  }
};

export const loadNativeSourcePreviews = async (
  capture: Pick<DesktopCaptureApi, 'getSourcePreview'>,
  sources: CaptureSource[],
  existing: CapturePreview[],
  refresh: boolean,
): Promise<CapturePreview[]> => {
  const previews = new Map(existing.map((preview) => [preview.id, preview]));
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < sources.length) {
      const source = sources[nextIndex++];
      if (!source) continue;
      try {
        const result = await withPreviewSlot(() =>
          capture.getSourcePreview({ sourceId: source.id, maxWidth: 300, maxHeight: 200, refresh }),
        );
        if (result.sourceId === source.id && result.status === 'ready' && result.thumbnail) {
          previews.set(source.id, {
            id: source.id,
            name: source.label,
            thumbnail: result.thumbnail,
            appIcon: null,
            displayId: source.displayId,
          });
        }
      } catch {
        // A source stays selectable with the explicit generic fallback.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PREVIEW_CONCURRENCY, sources.length) }, worker));
  return sources.flatMap((source) => {
    const preview = previews.get(source.id);
    return preview ? [{ ...preview, name: source.label, displayId: source.displayId }] : [];
  });
};
