import type { PerspectiveTransform } from '@beam/engine/zoom/perspective-projection';
import type { CameraPlaneView } from '@beam/engine/zoom/camera-plane-types';

export interface PerspectiveProjectionSample {
  positions: Float32Array;
  weight: number;
}
export interface PerspectiveCameraSample {
  camera: CameraPlaneView;
  transform: PerspectiveTransform;
  weight: number;
}
