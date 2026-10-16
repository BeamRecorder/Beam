import type { MediaRect } from '../shared/geometry-types';
import type { CameraPlaneView } from './camera-plane-types';
import { createPerspectiveGeometry, type PerspectiveTransform } from './perspective-projection';

/** Zoom the complete scene plane before projection; intermediate viewport edges are never source edges. */
export function cameraPlaneGeometry(
  width: number,
  height: number,
  transform: PerspectiveTransform,
  camera: CameraPlaneView,
  source: MediaRect,
) {
  return createPerspectiveGeometry(width, height, transform, {
    x: 0.5 + (source.x / width - camera.focusX) * camera.scale,
    y: 0.5 + (source.y / height - camera.focusY) * camera.scale,
    width: (source.width / width) * camera.scale,
    height: (source.height / height) * camera.scale,
  });
}
