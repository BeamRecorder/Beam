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

const unrotatePoint = (point: { x: number; y: number }, layout: HitTestLayout, rotation: number) => {
  if (!rotation) return point;
  const radians = (-rotation * Math.PI) / 180;
  const centerX = layout.left + layout.width / 2;
  const centerY = layout.top + layout.height / 2;
  const offsetX = point.x - centerX;
  const offsetY = point.y - centerY;
  return {
    x: centerX + offsetX * Math.cos(radians) - offsetY * Math.sin(radians),
    y: centerY + offsetX * Math.sin(radians) + offsetY * Math.cos(radians),
  };
};

export function topmostClipIdAtPoint(
  clips: readonly HitTestClip[],
  point: { x: number; y: number },
  layoutFor: (clip: HitTestClip) => HitTestLayout | null,
  includeScreen = false,
): string | null {
  for (const clip of clips) {
    const layout = layoutFor(clip);
    if (!layout) continue;
    const testPoint = clip.kind === 'shape' ? unrotatePoint(point, layout, clip.rotation) : point;
    const insideShape =
      isVisualClip(clip) && clip.cameraFramingPreset === 'squircle'
        ? pointInsideSquircle(testPoint.x, testPoint.y, layout, RAYCAST_SLOP_PX)
        : (clip.kind === 'blur' && clip.shape === 'circle') ||
            (isVisualClip(clip) && clip.cameraFramingPreset === 'circle')
          ? pointInsideEllipse(testPoint.x, testPoint.y, layout, RAYCAST_SLOP_PX)
          : pointInsideRect(testPoint.x, testPoint.y, layout, RAYCAST_SLOP_PX);
    if (insideShape) return clip.kind === 'screen' && !includeScreen ? null : clip.id;
  }
  return null;
}
