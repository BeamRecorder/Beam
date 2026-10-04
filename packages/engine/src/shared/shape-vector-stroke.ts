import type { ArrowMarker, ShapeVector, VectorNode, VectorSegment } from './shape-vector-types';
import { vectorPathData } from './shape-vector-svg';
import { splitVectorSegment, vectorSegment, vectorSegmentPoint } from './shape-vector-segment';

const reverse = (nodes: VectorNode[]) =>
  nodes
    .slice()
    .reverse()
    .map((node) => ({ ...node, in: node.out, out: node.in }));
const length = (segment: VectorSegment) => {
  let total = 0,
    previous = segment[0];
  const distances = [0];
  for (let i = 1; i <= 32; i++) {
    const point = vectorSegmentPoint(segment, i / 32);
    total += Math.hypot(point.x - previous.x, point.y - previous.y);
    distances.push(total);
    previous = point;
  }
  return distances;
};
function trimStart(nodes: VectorNode[], amount: number): VectorNode[] {
  let result = nodes;
  while (amount > 0 && result.length >= 2) {
    const segment = vectorSegment(result[0]!, result[1]!),
      distances = length(segment);
    const total = distances.at(-1)!;
    if (total <= amount) {
      amount -= total;
      result = result.slice(1);
      continue;
    }
    const index = distances.findIndex((distance) => distance >= amount);
    const before = distances[index - 1]!,
      span = distances[index]! - before;
    const t = (index - 1 + (amount - before) / span) / 32;
    const [, remaining] = splitVectorSegment(segment, t);
    result = [
      { ...result[0]!, ...remaining[0], in: undefined, out: remaining[1] },
      { ...result[1]!, in: remaining[2] },
      ...result.slice(2),
    ];
    break;
  }
  return result;
}

/** The shaft stops inside each tip: its rounded cap cannot protrude beyond the arrowhead. */
export function vectorStrokePathData(vector: ShapeVector, width: number, height: number, scale: number): string {
  const inset = (marker: ArrowMarker) =>
    marker === 'none'
      ? 0
      : marker === 'open'
        ? vector.strokeWidth * scale
        : marker === 'circle'
          ? (vector.markerSize * scale) / 2
          : vector.markerSize * scale * 0.8;
  const contours = vector.contours.map((contour) => {
    const nodes = contour.nodes.map((node) => ({
      ...node,
      x: node.x * width,
      y: node.y * height,
      in: node.in && { x: node.in.x * width, y: node.in.y * height },
      out: node.out && { x: node.out.x * width, y: node.out.y * height },
    }));
    if (contour.closed) return { ...contour, nodes };
    const total = nodes.slice(1).reduce((sum, node, i) => sum + length(vectorSegment(nodes[i]!, node)).at(-1)!, 0);
    const start = Math.min(inset(vector.startMarker), total * 0.45);
    const end = Math.min(inset(vector.endMarker), total * 0.45);
    return { ...contour, nodes: reverse(trimStart(reverse(trimStart(nodes, start)), end)) };
  });
  return vectorPathData({ ...vector, contours });
}
