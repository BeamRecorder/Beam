import {
  DEFAULT_ZOOM_TILT_HORIZONTAL,
  DEFAULT_ZOOM_TILT_VERTICAL,
  ZOOM_DEPTH_SCALES,
  normalizeZoomTiltAxis,
  normalizeZoomTiltIntensity,
  type ZoomElement,
} from './zoom-types';
import { cameraTiltForControls } from './composition-camera';
import { clampFocusToScale } from './zoom-playback';

export function createManualZoom(id: string, startMs: number, endMs: number): ZoomElement {
  return {
    id,
    sessionId: 'manual',
    startMs,
    endMs,
    focus: { cx: 0.5, cy: 0.5 },
    depth: 2,
    mode: 'manual',
    enabled: true,
    effect: 'camera',
    projection: '2d',
  };
}

/** Static camera sample; screenshot rendering has no timeline or animation state. */
export function manualCameraZoom(zoom: ZoomElement) {
  const scale = ZOOM_DEPTH_SCALES[zoom.depth];
  const tilt =
    zoom.projection === '3d'
      ? cameraTiltForControls(
          normalizeZoomTiltIntensity(zoom.tiltIntensity),
          normalizeZoomTiltAxis(zoom.tiltHorizontal, DEFAULT_ZOOM_TILT_HORIZONTAL),
          normalizeZoomTiltAxis(zoom.tiltVertical, DEFAULT_ZOOM_TILT_VERTICAL),
        )
      : { tiltX: 0, tiltY: 0 };
  return { scale, focus: clampFocusToScale(zoom.focus, scale), ...tilt };
}
