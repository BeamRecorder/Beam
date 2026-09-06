import type { ZoomElement } from './zoom-types';

export const MIN_PASTED_ZOOM_FRAGMENT_MS = 200;

export class ZoomPasteError extends Error {}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const defaultIdFactory = () => crypto.randomUUID();

export function pasteZoomAt(
  zooms: readonly ZoomElement[],
  copiedZoom: ZoomElement,
  timelineStartMs: number,
  timelineDurationMs: number,
  idFactory: () => string = defaultIdFactory,
): { elements: ZoomElement[]; zoomId: string } {
  const startMs = Math.round(timelineStartMs);
  const durationMs = Math.round(copiedZoom.endMs - copiedZoom.startMs);
  const endMs = startMs + durationMs;
  if (!Number.isFinite(startMs) || startMs < 0 || !Number.isFinite(timelineDurationMs) || timelineDurationMs <= 0)
    throw new ZoomPasteError('Invalid paste position.');
  if (durationMs < MIN_PASTED_ZOOM_FRAGMENT_MS || endMs > Math.round(timelineDurationMs))
    throw new ZoomPasteError('The copied zoom does not fit at the playhead.');

  const zoomId = idFactory();
  const elements: ZoomElement[] = [];
  for (const zoom of zooms) {
    if (zoom.endMs <= startMs || zoom.startMs >= endMs) {
      elements.push(clone(zoom));
      continue;
    }
    const leftDuration = startMs - zoom.startMs;
    const rightDuration = zoom.endMs - endMs;
    if (leftDuration >= MIN_PASTED_ZOOM_FRAGMENT_MS) elements.push({ ...clone(zoom), endMs: startMs });
    if (rightDuration >= MIN_PASTED_ZOOM_FRAGMENT_MS)
      elements.push({
        ...clone(zoom),
        id: leftDuration >= MIN_PASTED_ZOOM_FRAGMENT_MS ? idFactory() : zoom.id,
        startMs: endMs,
      });
  }
  elements.push({
    ...clone(copiedZoom),
    ...(copiedZoom.mode === 'auto' ? { linkedClipId: null } : {}),
    id: zoomId,
    startMs,
    endMs,
  });
  elements.sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id));
  return { elements, zoomId };
}
