import type { NormalizedTransform, VisualClip } from '~/media/shared/composition-types';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';
import { isPhoneFrame } from '../../composition/appearance/phone-frames';
import { mirrorCrop } from './layer-transform-geometry';

/** Keep the visible crop edge under the pointer while resizing the full source. */
export function resizeCroppedLayer(
  clip: VisualClip,
  initial: NormalizedTransform,
  resized: NormalizedTransform,
  corner?: ResizeCorner,
  preserveAspect = false,
): NormalizedTransform {
  if (!clip.crop || (clip.cameraFramingPreset ?? 'custom') !== 'custom' || isPhoneFrame(clip.appearance.frame))
    return resized;
  const crop = mirrorCrop(clip.crop, Boolean(clip.isMirrored), Boolean(clip.isMirroredY));
  const width = Math.min(4, Math.max(0.02, initial.width + (resized.width - initial.width) / crop.width));
  const height = Math.min(
    4,
    Math.max(
      0.02,
      preserveAspect
        ? (width * initial.height) / initial.width
        : initial.height + (resized.height - initial.height) / crop.height,
    ),
  );
  const widthDelta = width - initial.width;
  const heightDelta = height - initial.height;
  return {
    x: initial.x - (crop.x + (corner?.includes('left') ? crop.width : 0)) * widthDelta,
    y: initial.y - (crop.y + (corner?.includes('top') ? crop.height : 0)) * heightDelta,
    width,
    height,
  };
}
