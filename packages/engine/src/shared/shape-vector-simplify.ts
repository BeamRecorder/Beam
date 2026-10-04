import type { VectorPoint } from './shape-vector-types';

/** Error-bounded geometric reduction; pointer frequency does not determine the anchor count. */
export function simplifyVectorPoints(points: readonly VectorPoint[], width: number, height: number, tolerance = 2) {
  if (points.length < 3) return points.slice();
  if (![width, height, tolerance].every((value) => Number.isFinite(value) && value > 0))
    throw new RangeError('Invalid simplification dimensions or tolerance.');
  const retained = new Set([0, points.length - 1]);
  const pending = [[0, points.length - 1]];
  while (pending.length) {
    const [first, last] = pending.pop()!;
    const a = points[first!]!,
      b = points[last!]!;
    const dx = (b.x - a.x) * width,
      dy = (b.y - a.y) * height;
    const length = dx * dx + dy * dy;
    let furthest = -1,
      error = tolerance * tolerance;
    for (let i = first! + 1; i < last!; i++) {
      const px = (points[i]!.x - a.x) * width,
        py = (points[i]!.y - a.y) * height;
      const t = length ? Math.max(0, Math.min(1, (px * dx + py * dy) / length)) : 0;
      const distance = (px - dx * t) ** 2 + (py - dy * t) ** 2;
      if (distance > error) {
        error = distance;
        furthest = i;
      }
    }
    if (furthest !== -1) {
      retained.add(furthest);
      pending.push([first!, furthest], [furthest, last!]);
    }
  }
  return [...retained].sort((a, b) => a - b).map((i) => ({ ...points[i]! }));
}
