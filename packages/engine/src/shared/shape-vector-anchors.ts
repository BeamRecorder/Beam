import { isShapeVector } from './shape-vector-schema';
import type { VectorElement, VectorNode } from './shape-vector-types';

/** Keep exactly the authored anchors and handles; only change their local coordinate frame. */
export function finishAnchorPath(
  nodes: readonly VectorNode[],
  strokeWidth: number,
  canvas: { width: number; height: number },
): VectorElement | null {
  const vector = {
    version: 1 as const,
    contours: [{ closed: false, nodes: [...nodes] }],
    fillRule: 'nonzero' as const,
    strokeWidth,
    startMarker: 'none' as const,
    endMarker: 'triangle' as const,
    markerSize: 18,
  };
  if (
    ![canvas.width, canvas.height].every((n) => Number.isFinite(n) && n > 0) ||
    !isShapeVector(vector) ||
    !nodes.some((n) => Math.hypot(n.x - nodes[0]!.x, n.y - nodes[0]!.y) > 1e-10)
  )
    return null;
  const points = nodes.flatMap((n) => [n, ...(n.in ? [n.in] : []), ...(n.out ? [n.out] : [])]);
  const padding = Math.max(strokeWidth / 2, vector.markerSize) * (Math.min(canvas.width, canvas.height) / 1080);
  const x = Math.min(...points.map((p) => p.x)) - padding / canvas.width;
  const y = Math.min(...points.map((p) => p.y)) - padding / canvas.height;
  const width = Math.max(1 / canvas.width, Math.max(...points.map((p) => p.x)) - x + padding / canvas.width);
  const height = Math.max(1 / canvas.height, Math.max(...points.map((p) => p.y)) - y + padding / canvas.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  const local = (p: { x: number; y: number }) => ({ x: (p.x - x) / width, y: (p.y - y) / height });
  return {
    transform: { x, y, width, height },
    vector: {
      ...vector,
      contours: [
        {
          closed: false,
          nodes: nodes.map((n) => ({
            ...n,
            ...local(n),
            ...(n.in ? { in: local(n.in) } : {}),
            ...(n.out ? { out: local(n.out) } : {}),
          })),
        },
      ],
    },
  };
}
