import type { ClipComposition, NormalizedTransform, VisualClip } from '~/media/shared/composition-types';
import { isSplitCameraLayout } from '~/media/shared/camera-layout-types';
import type { VideoWindowBounds } from './useCameraZoom';
import {
  clampWebcamTransformToVisibleBounds,
  getWebcamZoomFactor,
  normalizeWebcamTransformToVisibleFraming,
  webcamSettingsForAppearance,
} from '../../composition/webcam/webcam-zoom';

const reactsToZoom = (clip: VisualClip) => !isSplitCameraLayout(clip.cameraLayoutPreset ?? 'custom');

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
      reactToZoom: reactsToZoom(clip),
    },
    transform,
    clip.cameraFramingPreset ?? 'custom',
    asset?.width ?? bounds.dw,
    asset?.height ?? bounds.dh,
  );
}

export const webcamResizePointerScale = (clip: VisualClip, boundsScale: number) =>
  getWebcamZoomFactor(boundsScale, reactsToZoom(clip));

export const clampEditedWebcamTransform = (clip: VisualClip, transform: NormalizedTransform, boundsScale: number) =>
  clampWebcamTransformToVisibleBounds(transform, boundsScale, reactsToZoom(clip));
