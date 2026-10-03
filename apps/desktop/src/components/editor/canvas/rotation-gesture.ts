export interface RotationPoint {
  x: number;
  y: number;
}

export const normalizeRotation = (degrees: number) => ((degrees % 360) + 360) % 360;

export const rotationPointerAngle = (center: RotationPoint, point: RotationPoint) =>
  (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;

export function rotationFromPointer(
  initialRotation: number,
  initialPointerAngle: number,
  center: RotationPoint,
  point: RotationPoint,
  snap = false,
) {
  const rotation = normalizeRotation(initialRotation + rotationPointerAngle(center, point) - initialPointerAngle);
  return snap ? normalizeRotation(Math.round(rotation / 15) * 15) : rotation;
}
