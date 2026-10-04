import type { VectorNode, VectorPoint, VectorSegment } from './shape-vector-types';

const mix = (a: VectorPoint, b: VectorPoint, t: number): VectorPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export function vectorSegment(a: VectorNode, b: VectorNode): VectorSegment {
  if (a.out || b.in) return [a, a.out ?? a, b.in ?? b, b];
  return [a, mix(a, b, 1 / 3), mix(a, b, 2 / 3), b];
}

export function splitVectorSegment(segment: VectorSegment, t: number): [VectorSegment, VectorSegment] {
  const [a, b, c, d] = segment;
  const ab = mix(a, b, t),
    bc = mix(b, c, t),
    cd = mix(c, d, t);
  const left = mix(ab, bc, t),
    right = mix(bc, cd, t),
    point = mix(left, right, t);
  return [
    [a, ab, left, point],
    [point, right, cd, d],
  ];
}

export function vectorSegmentPoint(segment: VectorSegment, t: number): VectorPoint {
  const [a, b, c, d] = segment,
    s = 1 - t;
  return {
    x: s ** 3 * a.x + 3 * s ** 2 * t * b.x + 3 * s * t ** 2 * c.x + t ** 3 * d.x,
    y: s ** 3 * a.y + 3 * s ** 2 * t * b.y + 3 * s * t ** 2 * c.y + t ** 3 * d.y,
  };
}
