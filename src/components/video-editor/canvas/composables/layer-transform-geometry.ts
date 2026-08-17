import type { VideoWindowBounds } from './useCameraZoom';

export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const projectCameraRect = (bounds: VideoWindowBounds, rect: CanvasRect): CanvasRect => {
  const scale = bounds.scale || 1;
  const centerX = bounds.dx + bounds.dw / 2;
  const centerY = bounds.dy + bounds.dh / 2;
  const focusX = bounds.focusX ?? centerX;
  const focusY = bounds.focusY ?? centerY;
  return {
    left: centerX + (rect.left - focusX) * scale,
    top: centerY + (rect.top - focusY) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
};

export const pointInsideRect = (x: number, y: number, rect: CanvasRect, slop = 0) =>
  x >= rect.left - slop &&
  x <= rect.left + rect.width + slop &&
  y >= rect.top - slop &&
  y <= rect.top + rect.height + slop;

export const pointInsideEllipse = (x: number, y: number, rect: CanvasRect, slop = 0) => {
  if (!pointInsideRect(x, y, rect, slop)) return false;
  const radiusX = rect.width / 2 + slop;
  const radiusY = rect.height / 2 + slop;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2 <= 1;
};

export const pointInsideSquircle = (x: number, y: number, rect: CanvasRect, slop = 0) => {
  if (!pointInsideRect(x, y, rect, slop)) return false;
  const radiusX = rect.width / 2 + slop;
  const radiusY = rect.height / 2 + slop;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return Math.abs((x - centerX) / radiusX) ** 4 + Math.abs((y - centerY) / radiusY) ** 4 <= 1;
};
