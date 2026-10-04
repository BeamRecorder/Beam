import type { LayerRotation3d, LayerPerspectivePoint, LayerPerspectiveRect } from './layer-perspective-types';
export const hasLayerRotation3d = (value?: LayerRotation3d) => Boolean(value && (value.x || value.y));
/** Keep the layer in front of the camera, including its 2D-rotated corners. */
export const layerPerspectiveDistance = (rect: LayerPerspectiveRect, requested: number) =>
  Math.max(requested, Math.hypot(rect.width, rect.height) * 0.505);
/** CSS-compatible perspective · rotateY · rotateX around the layer center. */
function homogeneousPoint(point: LayerPerspectivePoint, rect: LayerPerspectiveRect, rotation: LayerRotation3d) {
  const rx = (rotation.x * Math.PI) / 180,
    ry = (rotation.y * Math.PI) / 180;
  const cx = rect.x + rect.width / 2,
    cy = rect.y + rect.height / 2;
  const dx = point.x - cx,
    dy = point.y - cy,
    z = Math.sin(rx) * dy;
  return {
    x: Math.cos(ry) * dx + Math.sin(ry) * z,
    y: Math.cos(rx) * dy,
    cx,
    cy,
    w: 1 - (-Math.sin(ry) * dx + Math.cos(ry) * z) / layerPerspectiveDistance(rect, rotation.perspective),
  };
}
export function projectLayerPoint(point: LayerPerspectivePoint, rect: LayerPerspectiveRect, rotation: LayerRotation3d) {
  const p = homogeneousPoint(point, rect, rotation);
  return { x: p.cx + p.x / p.w, y: p.cy + p.y / p.w };
}
export function layerPerspectiveGeometry(
  width: number,
  height: number,
  rect: LayerPerspectiveRect,
  rotation: LayerRotation3d,
) {
  return new Float32Array(
    [
      [0, 0],
      [0, height],
      [width, 0],
      [width, height],
    ].flatMap(([x, y]) => {
      const p = homogeneousPoint({ x: x!, y: y! }, rect, rotation);
      return [(2 * (p.x + p.cx * p.w)) / width - p.w, p.w - (2 * (p.y + p.cy * p.w)) / height, 0, p.w];
    }),
  );
}
export function layerPerspectiveCorners(rect: LayerPerspectiveRect, rotation?: LayerRotation3d, angle = 0) {
  const radians = (angle * Math.PI) / 180,
    cos = Math.cos(radians),
    sin = Math.sin(radians);
  return [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([u, v]) => {
    const dx = (u! - 0.5) * rect.width,
      dy = (v! - 0.5) * rect.height;
    const point = {
      x: rect.x + rect.width / 2 + dx * cos - dy * sin,
      y: rect.y + rect.height / 2 + dx * sin + dy * cos,
    };
    return rotation ? projectLayerPoint(point, rect, rotation) : point;
  });
}
export function pointInsideLayerQuad(point: LayerPerspectivePoint, corners: readonly LayerPerspectivePoint[]) {
  let sign = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]!,
      b = corners[(i + 1) % corners.length]!;
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (Math.abs(cross) < 1e-8) continue;
    if (sign && sign !== Math.sign(cross)) return false;
    sign = Math.sign(cross);
  }
  return true;
}
