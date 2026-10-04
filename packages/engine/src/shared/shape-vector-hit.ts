import type { ShapeVector, VectorPoint, VectorSegmentHit, VectorSnap } from './shape-vector-types';
import { vectorSegment, vectorSegmentPoint } from './shape-vector-segment';

/** Screen-space alignment shared by placement and node dragging. */
export function snapVectorPoint(point: VectorPoint, anchors: readonly VectorPoint[], tolerance = 6): VectorSnap {
  let x: VectorPoint | undefined, y: VectorPoint | undefined;
  for (const anchor of anchors) {
    if (Math.abs(anchor.x - point.x) <= tolerance && (!x || Math.abs(anchor.x - point.x) < Math.abs(x.x - point.x)))
      x = anchor;
    if (Math.abs(anchor.y - point.y) <= tolerance && (!y || Math.abs(anchor.y - point.y) < Math.abs(y.y - point.y)))
      y = anchor;
  }
  const snapped = { x: x?.x ?? point.x, y: y?.y ?? point.y };
  return {
    point: snapped,
    guides: [
      ...(x ? [{ from: { x: snapped.x, y: x.y }, to: snapped }] : []),
      ...(y ? [{ from: { x: y.x, y: snapped.y }, to: snapped }] : []),
    ],
  };
}

/** Find the closest curve segment in pixel coordinates, including closing edges. */
export function closestVectorSegment(
  vector: ShapeVector,
  point: VectorPoint,
  width: number,
  height: number,
): VectorSegmentHit | null {
  let best: VectorSegmentHit | null = null;
  vector.contours.forEach((contour, contourIndex) => {
    for (let i = 0; i < contour.nodes.length - (contour.closed ? 0 : 1); i++) {
      const segment = vectorSegment(contour.nodes[i]!, contour.nodes[(i + 1) % contour.nodes.length]!);
      const distance = (t: number) => {
        const p = vectorSegmentPoint(segment, t);
        return Math.hypot((p.x - point.x) * width, (p.y - point.y) * height);
      };
      let nearest = 0,
        min = Infinity;
      for (let step = 0; step <= 32; step++) {
        const d = distance(step / 32);
        if (d < min) {
          min = d;
          nearest = step / 32;
        }
      }
      let left = Math.max(0, nearest - 1 / 32),
        right = Math.min(1, nearest + 1 / 32);
      for (let step = 0; step < 18; step++) {
        const a = left + (right - left) / 3,
          b = right - (right - left) / 3;
        if (distance(a) < distance(b)) right = b;
        else left = a;
      }
      const t = (left + right) / 2,
        d = distance(t);
      if (!best || d < best.distance) best = { contour: contourIndex, node: i, t, distance: d };
    }
  });
  return best;
}
