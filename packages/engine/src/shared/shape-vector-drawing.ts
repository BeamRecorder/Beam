import type { FreehandDrawing } from './element-types';
import type { ShapeVector, VectorNode } from './shape-vector-types';
import { smoothFreehandPoints } from './freehand-smoothing';
import { simplifyVectorPoints } from './shape-vector-simplify';
import { MAX_VECTOR_NODES } from './shape-vector-schema';

/** Keep meaningful anchors instead of exposing every pointer event to the node editor. */
export function drawingToVector(drawing: FreehandDrawing, width: number, height: number): ShapeVector {
  const raw = smoothFreehandPoints(drawing.points, drawing.smoothing, width, height);
  if (raw.length < 2) throw new TypeError('A vector stroke requires at least two points.');
  let tolerance = Math.max(1.5, Math.min(4, drawing.strokeWidth * 0.25));
  let points = simplifyVectorPoints(raw, width, height, tolerance);
  while (points.length > MAX_VECTOR_NODES) {
    tolerance *= 2;
    points = simplifyVectorPoints(raw, width, height, tolerance);
  }
  const nodes: VectorNode[] = points.map((p, i) => ({
    ...p,
    id: `node-${i}`,
    mode: drawing.smoothing ? 'smooth' : 'corner',
  }));
  if (drawing.smoothing > 0) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!,
        previous = nodes[Math.max(0, i - 1)]!,
        next = nodes[Math.min(nodes.length - 1, i + 1)]!;
      const dx = (next.x - previous.x) * width,
        dy = (next.y - previous.y) * height;
      const distance = Math.hypot(dx, dy);
      if (!distance) continue;
      const handle = (neighbor: VectorNode, direction: number) => {
        const length = Math.hypot((neighbor.x - node.x) * width, (neighbor.y - node.y) * height) / 3;
        return {
          x: node.x + (((direction * dx) / distance) * length) / width,
          y: node.y + (((direction * dy) / distance) * length) / height,
        };
      };
      if (i > 0) node.in = handle(previous, -1);
      if (i < nodes.length - 1) node.out = handle(next, 1);
    }
  }
  return {
    version: 1,
    contours: [{ closed: false, nodes }],
    fillRule: 'nonzero',
    strokeWidth: drawing.strokeWidth,
    startMarker: 'none',
    endMarker: 'none',
    markerSize: 18,
  };
}
