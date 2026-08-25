import {
  isVisualClip,
  type BlurClip,
  type CaptionClip,
  type ColorClip,
  type ShapeClip,
  type VisualClip,
} from '~/media/shared/composition-types';
import { pointInsideEllipse, pointInsideRect, pointInsideSquircle } from './layer-transform-geometry';

type HitTestClip = VisualClip | ColorClip | ShapeClip | BlurClip | CaptionClip;
type HitTestLayout = { left: number; top: number; width: number; height: number };
const RAYCAST_SLOP_PX = 4;

export function topmostClipIdAtPoint(
  clips: readonly HitTestClip[],
  point: { x: number; y: number },
  layoutFor: (clip: HitTestClip) => HitTestLayout | null,
): string | null {
  for (const clip of clips) {
    const layout = layoutFor(clip);
    if (!layout) continue;
    const insideShape =
      isVisualClip(clip) && clip.cameraFramingPreset === 'squircle'
        ? pointInsideSquircle(point.x, point.y, layout, RAYCAST_SLOP_PX)
        : (clip.kind === 'blur' && clip.shape === 'circle') ||
            (isVisualClip(clip) && clip.cameraFramingPreset === 'circle')
          ? pointInsideEllipse(point.x, point.y, layout, RAYCAST_SLOP_PX)
          : pointInsideRect(point.x, point.y, layout, RAYCAST_SLOP_PX);
    if (insideShape) return clip.kind === 'screen' ? null : clip.id;
  }
  return null;
}
