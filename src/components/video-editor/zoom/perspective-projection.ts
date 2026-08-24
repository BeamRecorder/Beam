export interface PerspectiveTransform {
  tiltX: number;
  tiltY: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface PerspectiveGeometry {
  /** Homogeneous clip-space vertices ordered for TRIANGLE_STRIP. */
  positions: Float32Array;
  coverScale: number;
}

const CAMERA_DISTANCE = 4;
const MAX_TILT = (65 * Math.PI) / 180;
const TARGET_CORNERS = [
  { x: -1, y: 1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: -1 },
] as const;

const clampTilt = (value: number) => Math.min(MAX_TILT, Math.max(-MAX_TILT, Number.isFinite(value) ? value : 0));

function homogeneousPoint(u: number, v: number, aspect: number, transform: PerspectiveTransform) {
  const tiltX = clampTilt(transform.tiltX);
  const tiltY = clampTilt(transform.tiltY);
  const x = (u * 2 - 1) * aspect;
  const y = 1 - v * 2;
  const yawX = Math.cos(tiltY) * x;
  const yawZ = -Math.sin(tiltY) * x;
  const pitchY = Math.cos(tiltX) * y - Math.sin(tiltX) * yawZ;
  const pitchZ = Math.sin(tiltX) * y + Math.cos(tiltX) * yawZ;
  return {
    x: yawX / aspect,
    y: pitchY,
    w: Math.max(0.25, (CAMERA_DISTANCE + pitchZ) / CAMERA_DISTANCE),
  };
}

const projectedNdcPoint = (
  u: number,
  v: number,
  aspect: number,
  transform: PerspectiveTransform,
  coverScale: number,
) => {
  const point = homogeneousPoint(u, v, aspect, transform);
  return { x: (point.x / point.w) * coverScale, y: (point.y / point.w) * coverScale };
};

function pointInsideConvexQuad(point: ProjectedPoint, quad: readonly ProjectedPoint[]) {
  let sign = 0;
  for (let index = 0; index < quad.length; index += 1) {
    const start = quad[index]!;
    const end = quad[(index + 1) % quad.length]!;
    const cross = (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
    if (Math.abs(cross) < 1e-8) continue;
    const nextSign = Math.sign(cross);
    if (sign && nextSign !== sign) return false;
    sign = nextSign;
  }
  return true;
}

function quadAtScale(aspect: number, transform: PerspectiveTransform, scale: number) {
  return [
    projectedNdcPoint(0, 0, aspect, transform, scale),
    projectedNdcPoint(1, 0, aspect, transform, scale),
    projectedNdcPoint(1, 1, aspect, transform, scale),
    projectedNdcPoint(0, 1, aspect, transform, scale),
  ];
}

export function perspectiveCoverScale(width: number, height: number, transform: PerspectiveTransform): number {
  const aspect = Math.max(1e-6, width / Math.max(1e-6, height));
  const coversViewport = (scale: number) => {
    const quad = quadAtScale(aspect, transform, scale);
    return TARGET_CORNERS.every((corner) => pointInsideConvexQuad(corner, quad));
  };
  if (coversViewport(1)) return 1;
  let low = 1;
  let high = 1.25;
  while (high < 4 && !coversViewport(high)) high *= 1.25;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const middle = (low + high) / 2;
    if (coversViewport(middle)) high = middle;
    else low = middle;
  }
  return Math.min(4, high * 1.002);
}

export function createPerspectiveGeometry(
  width: number,
  height: number,
  transform: PerspectiveTransform,
): PerspectiveGeometry {
  const aspect = Math.max(1e-6, width / Math.max(1e-6, height));
  const coverScale = perspectiveCoverScale(width, height, transform);
  const positions = new Float32Array(16);
  const corners = [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ] as const;
  corners.forEach(([u, v], index) => {
    const point = homogeneousPoint(u, v, aspect, transform);
    const offset = index * 4;
    positions[offset] = point.x * coverScale;
    positions[offset + 1] = point.y * coverScale;
    positions[offset + 2] = 0;
    positions[offset + 3] = point.w;
  });
  return { positions, coverScale };
}

export function projectPerspectivePoint(
  point: ProjectedPoint,
  bounds: { x: number; y: number; width: number; height: number },
  transform: PerspectiveTransform,
  coverScale = perspectiveCoverScale(bounds.width, bounds.height, transform),
): ProjectedPoint {
  const u = (point.x - bounds.x) / Math.max(1e-6, bounds.width);
  const v = (point.y - bounds.y) / Math.max(1e-6, bounds.height);
  const ndc = projectedNdcPoint(u, v, bounds.width / Math.max(1e-6, bounds.height), transform, coverScale);
  return {
    x: bounds.x + ((ndc.x + 1) / 2) * bounds.width,
    y: bounds.y + ((1 - ndc.y) / 2) * bounds.height,
  };
}

export function unprojectPerspectivePoint(
  point: ProjectedPoint,
  bounds: { x: number; y: number; width: number; height: number },
  transform: PerspectiveTransform,
  coverScale = perspectiveCoverScale(bounds.width, bounds.height, transform),
): ProjectedPoint {
  const width = Math.max(1e-6, bounds.width);
  const height = Math.max(1e-6, bounds.height);
  const aspect = width / height;
  const tiltX = clampTilt(transform.tiltX);
  const tiltY = clampTilt(transform.tiltY);
  const projectedX = (((point.x - bounds.x) / width) * 2 - 1) / Math.max(1e-6, coverScale);
  const projectedY = (1 - ((point.y - bounds.y) / height) * 2) / Math.max(1e-6, coverScale);
  const sinX = Math.sin(tiltX);
  const cosX = Math.cos(tiltX);
  const sinY = Math.sin(tiltY);
  const cosY = Math.cos(tiltY);
  const a = cosY / aspect + (projectedX * cosX * sinY) / CAMERA_DISTANCE;
  const b = (-projectedX * sinX) / CAMERA_DISTANCE;
  const c = sinX * sinY + (projectedY * cosX * sinY) / CAMERA_DISTANCE;
  const d = cosX - (projectedY * sinX) / CAMERA_DISTANCE;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-8) return { x: bounds.x + width / 2, y: bounds.y + height / 2 };
  const x = (projectedX * d - b * projectedY) / determinant;
  const y = (a * projectedY - projectedX * c) / determinant;
  return {
    x: bounds.x + ((x / aspect + 1) / 2) * width,
    y: bounds.y + ((1 - y) / 2) * height,
  };
}

export const hasPerspectiveTilt = (transform: PerspectiveTransform) =>
  Math.abs(transform.tiltX) > 0.000_01 || Math.abs(transform.tiltY) > 0.000_01;
