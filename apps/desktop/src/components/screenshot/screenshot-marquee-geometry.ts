import type { CanvasMarqueeBounds, CanvasMarqueeTarget } from '../editor/canvas/canvas-marquee-types';

/** Map canvas-local projected bounds into the full workspace, including pan, zoom and UI scale. */
export function screenshotMarqueeTargetsInSurface(
  targets: readonly CanvasMarqueeTarget[],
  viewport: { width: number; height: number },
  canvas: CanvasMarqueeBounds,
  surface: CanvasMarqueeBounds,
  logical: { width: number; height: number },
): CanvasMarqueeTarget[] {
  if (
    ![
      viewport.width,
      viewport.height,
      canvas.width,
      canvas.height,
      surface.width,
      surface.height,
      logical.width,
      logical.height,
    ].every((value) => Number.isFinite(value) && value > 0)
  )
    return [];
  const uiX = logical.width / surface.width,
    uiY = logical.height / surface.height;
  const scaleX = (canvas.width / viewport.width) * uiX,
    scaleY = (canvas.height / viewport.height) * uiY;
  return targets.map((target) => ({
    ...target,
    x: (canvas.x - surface.x) * uiX + target.x * scaleX,
    y: (canvas.y - surface.y) * uiY + target.y * scaleY,
    width: target.width * scaleX,
    height: target.height * scaleY,
  }));
}
