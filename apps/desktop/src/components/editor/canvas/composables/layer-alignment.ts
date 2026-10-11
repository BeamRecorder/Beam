import type { CanvasRect } from './layer-transform-geometry';
import type { VideoWindowBounds } from './useCameraZoom';
import { computeCanvasAlignmentSnapping, type AlignmentGuide } from './canvas-alignment';

/** Snap rendered bounds, then return a pixel delta without changing source geometry. */
export function snapDisplayedLayerTranslation(
  layouts: readonly CanvasRect[],
  targets: readonly CanvasRect[],
  viewport: VideoWindowBounds | null,
) {
  if (!layouts.length || !viewport || viewport.dw <= 0 || viewport.dh <= 0)
    return { x: 0, y: 0, guides: [] as AlignmentGuide[] };
  const normalize = (rect: CanvasRect) => ({
    x: (rect.left - viewport.dx) / viewport.dw,
    y: (rect.top - viewport.dy) / viewport.dh,
    width: rect.width / viewport.dw,
    height: rect.height / viewport.dh,
  });
  const left = Math.min(...layouts.map((rect) => rect.left));
  const top = Math.min(...layouts.map((rect) => rect.top));
  const moved = normalize({
    left,
    top,
    width: Math.max(...layouts.map((rect) => rect.left + rect.width)) - left,
    height: Math.max(...layouts.map((rect) => rect.top + rect.height)) - top,
  });
  const snapped = computeCanvasAlignmentSnapping(moved, targets.map(normalize));
  return {
    x: (snapped.x - moved.x) * viewport.dw,
    y: (snapped.y - moved.y) * viewport.dh,
    guides: snapped.guides,
  };
}
