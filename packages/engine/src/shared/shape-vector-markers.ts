import type { ArrowMarker, ShapeVector, VectorPoint } from './shape-vector-types';

/** Marker artwork in pixel coordinates. Open tips remain strokes, other tips are fills. */
export function vectorMarkerPaths(vector: ShapeVector, width: number, height: number, scale: number) {
  const filled: string[] = [],
    outlined: string[] = [];
  const point = (p: VectorPoint) => ({ x: p.x * width, y: p.y * height });
  const marker = (kind: ArrowMarker, tip: VectorPoint, neighbor: VectorPoint) => {
    if (kind === 'none') return;
    const dx = tip.x - neighbor.x,
      dy = tip.y - neighbor.y,
      distance = Math.hypot(dx, dy);
    if (distance < 1e-8) return;
    const size = vector.markerSize * scale,
      ux = dx / distance,
      uy = dy / distance;
    const x = tip.x - ux * size,
      y = tip.y - uy * size,
      half = size * 0.55;
    const left = `${x - uy * half} ${y + ux * half}`,
      right = `${x + uy * half} ${y - ux * half}`;
    if (kind === 'circle') {
      const r = size / 2;
      const cx = tip.x - ux * r,
        cy = tip.y - uy * r;
      filled.push(`M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`);
    } else if (kind === 'triangle') filled.push(`M${tip.x} ${tip.y}L${left}L${right}Z`);
    else outlined.push(`M${left}L${tip.x} ${tip.y}L${right}`);
  };
  for (const contour of vector.contours) {
    if (contour.closed) continue;
    const first = contour.nodes[0]!,
      last = contour.nodes.at(-1)!;
    const next = contour.nodes[1]!,
      previous = contour.nodes.at(-2)!;
    // A zero-length handle has no tangent; use the adjacent anchor in that case.
    const start = first.out && Math.hypot(first.out.x - first.x, first.out.y - first.y) > 1e-8 ? first.out : next;
    const end = last.in && Math.hypot(last.in.x - last.x, last.in.y - last.y) > 1e-8 ? last.in : previous;
    marker(vector.startMarker, point(first), point(start));
    marker(vector.endMarker, point(last), point(end));
  }
  return { filled: filled.join(''), outlined: outlined.join('') };
}
