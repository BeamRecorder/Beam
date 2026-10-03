import type { VisualClip } from '../shared/composition-types';
import { resolveScreenRenderGeometry } from '../composition/camera-layout';
import { frameMediaRect, frameOuterRect } from '../shared/frame-layout';
import { rotateMediaVector } from '../layout/media-rotation';
import type { ZoomGenerationOptions } from './glass-generation-types';

/** Match the decorated media painter, rejecting clicks outside the visible source crop. */
export function recordingFocus(
  clip: VisualClip,
  point: { cx: number; cy: number },
  sourceWidth: number,
  sourceHeight: number,
  canvas: ZoomGenerationOptions['canvas'],
) {
  const geometry = resolveScreenRenderGeometry(
    clip,
    sourceWidth,
    sourceHeight,
    canvas.width,
    canvas.height,
    canvas.showBackground,
  );
  let x = (point.cx * sourceWidth - geometry.source.x) / geometry.source.width;
  let y = (point.cy * sourceHeight - geometry.source.y) / geometry.source.height;
  if (![x, y].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  if (clip.isMirrored) x = 1 - x;
  if (clip.isMirroredY) y = 1 - y;
  const appearance = clip.appearance;
  const frame = appearance?.frame ?? 'none';
  const content = frameMediaRect(geometry.positioned, frame, geometry.source.width, geometry.source.height, {
    showMenu: appearance?.frameShowMenu,
    showScrollbars: appearance?.frameShowScrollbars,
    chromeScale: appearance?.frameChromeScale,
  });
  const outer = frameOuterRect(geometry.positioned, frame);
  const center = { x: outer.x + outer.width / 2, y: outer.y + outer.height / 2 };
  const rotated = rotateMediaVector(
    { x: content.x + x * content.width - center.x, y: content.y + y * content.height - center.y },
    clip.rotation ?? 0,
  );
  return { cx: (center.x + rotated.x) / canvas.width, cy: (center.y + rotated.y) / canvas.height };
}
