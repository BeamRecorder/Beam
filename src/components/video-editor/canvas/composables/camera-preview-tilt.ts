import { cameraTiltForControls } from '../../zoom/composition-camera';
import {
  DEFAULT_ZOOM_TILT_HORIZONTAL,
  DEFAULT_ZOOM_TILT_VERTICAL,
  normalizeZoomProjection,
  normalizeZoomTiltAxis,
  normalizeZoomTiltIntensity,
  type ZoomElement,
} from '../../zoom/zoom-types';

export function selectedZoomPreviewTilt(selectedZoom: ZoomElement | null, isPlaying: boolean) {
  if (isPlaying || selectedZoom?.mode !== 'manual' || normalizeZoomProjection(selectedZoom.projection) !== '3d')
    return null;
  return cameraTiltForControls(
    normalizeZoomTiltIntensity(selectedZoom.tiltIntensity),
    normalizeZoomTiltAxis(selectedZoom.tiltHorizontal, DEFAULT_ZOOM_TILT_HORIZONTAL),
    normalizeZoomTiltAxis(selectedZoom.tiltVertical, DEFAULT_ZOOM_TILT_VERTICAL),
  );
}
