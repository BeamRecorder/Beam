import type { ZoomElement } from '../zoom-types';
import type { ExperimentalGeometry } from './experimental-camera-types';
import { projectZoomFocusToViewport } from '../recordly/videoPlayback/focusUtils';

/** Authored Beam handles use canvas coordinates; source-space provenance must not survive a handle move. */
export function recordlyFocusOnCanvas(zoom: ZoomElement, geometry: ExperimentalGeometry) {
  if (!zoom.focusSpace) return zoom.focus;
  const viewport = projectZoomFocusToViewport(zoom, geometry.crop);
  return {
    cx: geometry.mask.x + viewport.cx * geometry.mask.width,
    cy: geometry.mask.y + viewport.cy * geometry.mask.height,
  };
}
