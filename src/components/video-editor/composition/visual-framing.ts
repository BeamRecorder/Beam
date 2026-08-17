import type { CameraFramingPreset } from '~/media/shared/camera-layout-types';
import type { ClipComposition, NormalizedTransform, VisualClip } from '~/media/shared/composition-types';
import type { CanvasRect } from '../canvas/output-canvas';
import { resolveCameraFraming } from './camera-layout';

export function resolveVisualClipFraming(
  clip: VisualClip,
  bounds: CanvasRect,
  sourceWidth: number,
  sourceHeight: number,
  crop = clip.crop,
  preset: CameraFramingPreset = clip.cameraFramingPreset ?? 'custom',
) {
  if (preset === 'squircle' && clip.kind !== 'webcam') {
    return { ...resolveCameraFraming('fill', bounds, sourceWidth, sourceHeight, crop), mask: 'squircle' as const };
  }
  return resolveCameraFraming(preset, bounds, sourceWidth, sourceHeight, crop);
}

export function visualClipDisplayLayout(
  clip: VisualClip,
  transform: NormalizedTransform,
  viewport: { x: number; y: number; width: number; height: number },
  sourceWidth: number,
  sourceHeight: number,
  preset: CameraFramingPreset,
) {
  const framing = resolveVisualClipFraming(
    clip,
    {
      x: viewport.x + transform.x * viewport.width,
      y: viewport.y + transform.y * viewport.height,
      width: transform.width * viewport.width,
      height: transform.height * viewport.height,
    },
    sourceWidth,
    sourceHeight,
    clip.crop,
    preset,
  );
  return { left: framing.rect.x, top: framing.rect.y, width: framing.rect.width, height: framing.rect.height };
}

export function editableVisualClipTransform(
  composition: ClipComposition,
  clip: VisualClip,
  transform: NormalizedTransform,
  bounds: { dx: number; dy: number; dw: number; dh: number },
) {
  const preset = clip.cameraFramingPreset ?? 'custom';
  if (preset === 'custom' || preset === 'fill' || preset === 'squircle') return transform;
  const asset = composition.assets.find((entry) => entry.id === clip.assetId);
  const viewport = { x: bounds.dx, y: bounds.dy, width: bounds.dw, height: bounds.dh };
  const visible = visualClipDisplayLayout(
    clip,
    transform,
    viewport,
    asset?.width ?? bounds.dw,
    asset?.height ?? bounds.dh,
    preset,
  );
  return {
    x: (visible.left - viewport.x) / Math.max(1, viewport.width),
    y: (visible.top - viewport.y) / Math.max(1, viewport.height),
    width: visible.width / Math.max(1, viewport.width),
    height: visible.height / Math.max(1, viewport.height),
  };
}
