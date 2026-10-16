import { cameraTiltForControls } from '@beam/engine/zoom/composition-camera';
import { manualCameraZoom } from '@beam/engine/zoom/manual-zoom';
import {
  DEFAULT_ZOOM_TILT_HORIZONTAL,
  DEFAULT_ZOOM_TILT_VERTICAL,
  normalizeZoomProjection,
  normalizeZoomTiltAxis,
  normalizeZoomTiltIntensity,
  type ZoomElement,
} from '@beam/engine/zoom/zoom-types';

export function selectedZoomPreviewTilt(selectedZoom: ZoomElement | null, isPlaying: boolean) {
  if (
    isPlaying ||
    selectedZoom?.effect === 'glass' ||
    selectedZoom?.mode !== 'manual' ||
    normalizeZoomProjection(selectedZoom.projection) === '2d'
  )
    return null;
  if (selectedZoom.projection === 'orbit') {
    const camera = manualCameraZoom(selectedZoom);
    return { tiltX: 0, tiltY: 0, orbit: camera.orbit };
  }
  return cameraTiltForControls(
    normalizeZoomTiltIntensity(selectedZoom.tiltIntensity),
    normalizeZoomTiltAxis(selectedZoom.tiltHorizontal, DEFAULT_ZOOM_TILT_HORIZONTAL),
    normalizeZoomTiltAxis(selectedZoom.tiltVertical, DEFAULT_ZOOM_TILT_VERTICAL),
  );
}
