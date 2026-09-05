import type { ClipComposition, NormalizedTransform, VisualClip } from '~/media/shared/composition-types';
import type { CameraFramingPreset } from '~/media/shared/camera-layout-types';
import type { VideoWindowBounds } from './useCameraZoom';
import {
  clampWebcamTransformToVisibleBounds,
  computeWebcamLayout,
  getWebcamZoomFactor,
  normalizeWebcamTransformToVisibleFraming,
  webcamReactsToZoom,
  webcamSettingsForAppearance,
} from '../../composition/webcam/webcam-zoom';
import { resolveCameraFraming } from '../../composition/camera-layout';
import { isPhoneFrame } from '../../composition/appearance/phone-frames';

export function webcamDisplayLayout(
  composition: ClipComposition,
  clip: VisualClip,
  bounds: VideoWindowBounds,
  transform: NormalizedTransform,
  framingPreset: CameraFramingPreset,
) {
  const asset = composition.assets.find((entry) => entry.id === clip.assetId);
  const layout = computeWebcamLayout(
    bounds.dw,
    bounds.dh,
    bounds.scale,
    {
      ...webcamSettingsForAppearance(clip.appearance, clip.isMirrored, clip.isMirroredY),
      reactToZoom: webcamReactsToZoom(clip),
    },
    transform,
  );
  const framing = resolveCameraFraming(
    framingPreset,
    layout,
    asset?.width ?? layout.width,
    asset?.height ?? layout.height,
    clip.crop,
    clip.isMirrored,
    clip.isMirroredY,
  );
  const rect = framingPreset === 'custom' && isPhoneFrame(clip.appearance.frame) ? layout : framing.rect;
  return {
    left: bounds.dx + rect.x,
    top: bounds.dy + rect.y,
    width: rect.width,
    height: rect.height,
  };
}

export function editableWebcamTransform(
  composition: ClipComposition,
  clip: VisualClip,
  bounds: VideoWindowBounds,
  transform: NormalizedTransform,
): NormalizedTransform {
  const asset = composition.assets.find((entry) => entry.id === clip.assetId);
  return normalizeWebcamTransformToVisibleFraming(
    bounds.dw,
    bounds.dh,
    bounds.scale,
    {
      ...webcamSettingsForAppearance(clip.appearance, clip.isMirrored, clip.isMirroredY),
      reactToZoom: webcamReactsToZoom(clip),
    },
    transform,
    clip.cameraFramingPreset ?? 'custom',
    asset?.width ?? bounds.dw,
    asset?.height ?? bounds.dh,
  );
}

export const webcamResizePointerScale = (clip: VisualClip, boundsScale: number) =>
  getWebcamZoomFactor(boundsScale, webcamReactsToZoom(clip));

export const clampEditedWebcamTransform = (clip: VisualClip, transform: NormalizedTransform, boundsScale: number) =>
  clampWebcamTransformToVisibleBounds(transform, boundsScale, webcamReactsToZoom(clip));
