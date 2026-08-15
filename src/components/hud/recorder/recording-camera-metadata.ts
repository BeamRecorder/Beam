import { capture } from '../../../api/capture';
import type { CameraAppearance, CameraPlacement } from '../../../api/camera-recorder';

const DEFAULT_CAMERA_PLACEMENT: CameraPlacement = { x: 0.72, y: 0.72, width: 0.24, height: 0.24 };

export async function recordingCameraMetadata(): Promise<{
  appearance?: CameraAppearance;
  placement: CameraPlacement;
}> {
  const overlay = await capture.getCameraOverlayState();
  const appearance: CameraAppearance | undefined =
    overlay &&
    ['none', 'sm', 'md', 'lg'].includes(overlay.shadowSize) &&
    ['none', 'sm', 'md', 'lg', 'full'].includes(overlay.cornerRadius)
      ? {
          shadowSize: overlay.shadowSize as CameraAppearance['shadowSize'],
          cornerRadius: overlay.cornerRadius as CameraAppearance['cornerRadius'],
        }
      : undefined;
  return { appearance, placement: { ...DEFAULT_CAMERA_PLACEMENT } };
}
