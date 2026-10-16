import { ZOOM_DEPTH_SCALES, type ZoomElement } from '@beam/engine/zoom/zoom-types';
import { clampFocusToScale } from '@beam/engine/zoom/zoom-playback';
import { hasPerspectiveTilt, unprojectPerspectivePoint } from '@beam/engine/zoom/perspective-projection';
import { elementMatrix } from '../../elements/element-projection';
import type { VideoWindowBounds } from './useCameraZoom.types';

export function cameraFocusTargetStyle(
  bounds: VideoWindowBounds | null,
  selected: ZoomElement | null,
  playing: boolean,
  draft: { cx: number; cy: number } | null,
) {
  if (!selected || selected.effect === 'glass' || selected.mode !== 'manual' || playing || !bounds)
    return { display: 'none' };
  const selectionScale = ZOOM_DEPTH_SCALES[selected.depth],
    scale = bounds.scale || 1;
  const centerX = bounds.dx + bounds.dw / 2,
    centerY = bounds.dy + bounds.dh / 2;
  const focusX = bounds.focusX ?? centerX,
    focusY = bounds.focusY ?? centerY;
  const width = bounds.dw / selectionScale,
    height = bounds.dh / selectionScale;
  const focus = clampFocusToScale(draft ?? selected.focus, selectionScale);
  const x = focus.cx * bounds.dw - width / 2,
    y = focus.cy * bounds.dh - height / 2;
  if (hasPerspectiveTilt({ tiltX: bounds.tiltX ?? 0, tiltY: bounds.tiltY ?? 0, orbit: bounds.orbit }))
    return {
      width: `${width}px`,
      height: `${height}px`,
      transformOrigin: '0 0',
      willChange: 'transform',
      transform: elementMatrix(
        { x, y, width, height },
        { x: 0, y: 0, width: bounds.dw, height: bounds.dh },
        { ...bounds, focusX: focusX - bounds.dx, focusY: focusY - bounds.dy },
      ),
    };
  return {
    width: `${width * scale}px`,
    height: `${height * scale}px`,
    transform: `translate3d(${centerX + (bounds.dx + x - focusX) * scale - bounds.dx}px, ${centerY + (bounds.dy + y - focusY) * scale - bounds.dy}px, 0)`,
    willChange: 'transform',
  };
}
function cameraFocusCoordinates(point: { x: number; y: number }, bounds: VideoWindowBounds) {
  const viewport = { x: bounds.dx, y: bounds.dy, width: bounds.dw, height: bounds.dh };
  const flat = unprojectPerspectivePoint(point, viewport, {
    tiltX: bounds.tiltX ?? 0,
    tiltY: bounds.tiltY ?? 0,
    orbit: bounds.orbit,
  });
  const scale = bounds.scale || 1,
    centerX = bounds.dx + bounds.dw / 2,
    centerY = bounds.dy + bounds.dh / 2;
  return {
    cx: ((flat.x - centerX) / scale + (bounds.focusX ?? centerX) - bounds.dx) / bounds.dw,
    cy: ((flat.y - centerY) / scale + (bounds.focusY ?? centerY) - bounds.dy) / bounds.dh,
  };
}
export function cameraFocusAtPoint(
  point: { x: number; y: number },
  bounds: VideoWindowBounds,
  depth: ZoomElement['depth'],
) {
  return clampFocusToScale(cameraFocusCoordinates(point, bounds), ZOOM_DEPTH_SCALES[depth]);
}
export function cameraFocusContainsPoint(
  point: { x: number; y: number },
  bounds: VideoWindowBounds,
  zoom: ZoomElement,
) {
  if (point.x < bounds.dx || point.x > bounds.dx + bounds.dw || point.y < bounds.dy || point.y > bounds.dy + bounds.dh)
    return false;
  const scale = ZOOM_DEPTH_SCALES[zoom.depth];
  const focus = clampFocusToScale(zoom.focus, scale);
  const pointer = cameraFocusCoordinates(point, bounds);
  const half = 1 / (2 * scale);
  return Math.abs(pointer.cx - focus.cx) <= half && Math.abs(pointer.cy - focus.cy) <= half;
}
