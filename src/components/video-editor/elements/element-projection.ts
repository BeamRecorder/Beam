import type { DrawingPoint } from '~/media/shared/element-types';
import type { ElementCamera, ElementViewport } from './element-editor-types';
import { projectPerspectivePoint, unprojectPerspectivePoint } from '../zoom/perspective-projection';

export function projectElementPoint(
  p: DrawingPoint,
  viewport: ElementViewport,
  camera: ElementCamera = {},
): DrawingPoint {
  const cx = viewport.x + viewport.width / 2,
    cy = viewport.y + viewport.height / 2;
  const scale = camera.scale ?? 1;
  return projectPerspectivePoint(
    { x: cx + (p.x - (camera.focusX ?? cx)) * scale, y: cy + (p.y - (camera.focusY ?? cy)) * scale },
    viewport,
    { tiltX: camera.tiltX ?? 0, tiltY: camera.tiltY ?? 0 },
  );
}
export function unprojectElementPoint(
  p: DrawingPoint,
  viewport: ElementViewport,
  camera: ElementCamera = {},
): DrawingPoint {
  const point = unprojectPerspectivePoint(p, viewport, { tiltX: camera.tiltX ?? 0, tiltY: camera.tiltY ?? 0 });
  const cx = viewport.x + viewport.width / 2,
    cy = viewport.y + viewport.height / 2;
  const scale = Math.max(0.001, camera.scale ?? 1);
  return {
    x: ((point.x - cx) / scale + (camera.focusX ?? cx) - viewport.x) / viewport.width,
    y: ((point.y - cy) / scale + (camera.focusY ?? cy) - viewport.y) / viewport.height,
  };
}

/** Maps an editable DOM rectangle onto the same camera quad as the canvas renderer. */
export function elementMatrix(
  rect: ElementViewport,
  viewport: ElementViewport,
  camera: ElementCamera = {},
  rotation = 0,
): string {
  const radians = (rotation * Math.PI) / 180,
    cos = Math.cos(radians),
    sin = Math.sin(radians);
  const corners = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([u, v]) => {
    const x = (u! - 0.5) * rect.width,
      y = (v! - 0.5) * rect.height;
    return projectElementPoint(
      { x: rect.x + rect.width / 2 + x * cos - y * sin, y: rect.y + rect.height / 2 + x * sin + y * cos },
      viewport,
      camera,
    );
  });
  const [a, b, c, d] = corners as [DrawingPoint, DrawingPoint, DrawingPoint, DrawingPoint];
  const dx1 = b.x - c.x,
    dx2 = d.x - c.x,
    dx3 = a.x - b.x + c.x - d.x;
  const dy1 = b.y - c.y,
    dy2 = d.y - c.y,
    dy3 = a.y - b.y + c.y - d.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(determinant) < 1e-10 ? 0 : (dx3 * dy2 - dx2 * dy3) / determinant;
  const h = Math.abs(determinant) < 1e-10 ? 0 : (dx1 * dy3 - dx3 * dy1) / determinant;
  const w = Math.max(0.001, rect.width),
    height = Math.max(0.001, rect.height);
  return `matrix3d(${(b.x - a.x + g * b.x) / w},${(b.y - a.y + g * b.y) / w},0,${g / w},${(d.x - a.x + h * d.x) / height},${(d.y - a.y + h * d.y) / height},0,${h / height},0,0,1,0,${a.x},${a.y},0,1)`;
}
