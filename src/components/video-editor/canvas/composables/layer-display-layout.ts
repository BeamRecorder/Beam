import {
  isBlurClip,
  isVisualClip,
  type BlurClip,
  type ClipComposition,
  type ColorClip,
  type NormalizedTransform,
  type ShapeClip,
  type VisualClip,
} from '~/media/shared/composition-types';
import { effectShapeRect } from '../../composition/effects/blur-effect';
import { visualClipDisplayLayout } from '../../composition/visual-framing';
import { isPhoneFrame } from '../../composition/appearance/phone-frames';
import { projectCameraRect } from './layer-transform-geometry';
import { webcamDisplayLayout } from './webcam-transform-editing';
import type { VideoWindowBounds } from './useCameraZoom';
import type { TransformClip } from '../editor-canvas-types';

const usesGlobalCamera = (clip: TransformClip): clip is VisualClip | ColorClip | ShapeClip | BlurClip =>
  clip.kind === 'screen' ||
  clip.kind === 'video' ||
  clip.kind === 'image' ||
  clip.kind === 'color' ||
  clip.kind === 'shape' ||
  clip.kind === 'blur';

export function transformClipDisplayLayout(options: {
  composition: ClipComposition;
  clip: TransformClip;
  transform: NormalizedTransform;
  bounds: VideoWindowBounds;
  isCropping: boolean;
}) {
  const { clip, bounds, transform } = options;
  if (clip.kind === 'webcam')
    return webcamDisplayLayout(
      options.composition,
      clip,
      bounds,
      transform,
      options.isCropping ? 'custom' : (clip.cameraFramingPreset ?? 'custom'),
    );
  if (isVisualClip(clip)) {
    const asset = options.composition.assets.find((entry) => entry.id === clip.assetId);
    const editingPhoneCrop = options.isCropping && isPhoneFrame(clip.appearance.frame);
    const editingDesktopFrameCrop = options.isCropping && clip.appearance.frame !== 'none' && !editingPhoneCrop;
    const visible = visualClipDisplayLayout(
      clip,
      transform,
      { x: bounds.dx, y: bounds.dy, width: bounds.dw, height: bounds.dh },
      asset?.width ?? bounds.dw,
      asset?.height ?? bounds.dh,
      editingPhoneCrop ? 'fit' : options.isCropping ? 'custom' : (clip.cameraFramingPreset ?? 'custom'),
      editingPhoneCrop ? 'none' : editingDesktopFrameCrop ? 'content' : 'outer',
    );
    return usesGlobalCamera(clip) ? projectCameraRect(bounds, visible) : visible;
  }
  const rect = {
    left: bounds.dx + transform.x * bounds.dw,
    top: bounds.dy + transform.y * bounds.dh,
    width: transform.width * bounds.dw,
    height: transform.height * bounds.dh,
  };
  const effectRect = isBlurClip(clip)
    ? effectShapeRect(clip.shape, { x: rect.left, y: rect.top, width: rect.width, height: rect.height })
    : null;
  const visible = effectRect
    ? { left: effectRect.x, top: effectRect.y, width: effectRect.width, height: effectRect.height }
    : rect;
  return usesGlobalCamera(clip) ? projectCameraRect(bounds, visible) : visible;
}
