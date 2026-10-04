import type { NormalizedTransform } from './composition-types';
import type { ShapeVector, VectorHandleSelection, VectorNodeSelection, VectorPoint } from './shape-vector-types';
import { MAX_VECTOR_NODES } from './shape-vector-schema';

const mix = (a: VectorPoint, b: VectorPoint, t: number): VectorPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const copy = (vector: ShapeVector) => ({
  ...vector,
  arrowPreset: undefined,
  contours: vector.contours.map((c) => ({
    ...c,
    nodes: c.nodes.map((n) => ({
      ...n,
      ...(n.in ? { in: { ...n.in } } : {}),
      ...(n.out ? { out: { ...n.out } } : {}),
    })),
  })),
});
const anchorAt = (vector: ShapeVector, selection: VectorNodeSelection) => {
  const node = vector.contours[selection.contour]?.nodes[selection.node];
  if (!node) throw new RangeError('Unknown vector anchor.');
  return node;
};

export function moveVectorPoint(
  vector: ShapeVector,
  selection: VectorHandleSelection,
  point: VectorPoint,
  independent = false,
): ShapeVector {
  if (![point.x, point.y].every((v) => Number.isFinite(v) && Math.abs(v) <= 8))
    throw new RangeError('Invalid vector point.');
  const result = copy(vector),
    node = anchorAt(result, selection);
  if (!selection.handle) {
    const points = [node, ...(node.in ? [node.in] : []), ...(node.out ? [node.out] : [])];
    const dx = Math.max(
      -8 - Math.min(...points.map((p) => p.x)),
      Math.min(8 - Math.max(...points.map((p) => p.x)), point.x - node.x),
    );
    const dy = Math.max(
      -8 - Math.min(...points.map((p) => p.y)),
      Math.min(8 - Math.max(...points.map((p) => p.y)), point.y - node.y),
    );
    for (const handle of [node.in, node.out])
      if (handle) {
        handle.x += dx;
        handle.y += dy;
      }
    node.x += dx;
    node.y += dy;
  } else {
    const other = selection.handle === 'in' ? 'out' : 'in';
    const opposite = node[other];
    if (node.mode === 'smooth' && opposite && !independent) {
      const length = Math.hypot(opposite.x - node.x, opposite.y - node.y);
      const dx = point.x - node.x,
        dy = point.y - node.y,
        distance = Math.hypot(dx, dy);
      const ratio = Math.min(
        1,
        (8 - Math.abs(node.x)) / Math.max(1e-10, Math.abs((dx * length) / Math.max(distance, 1e-10))),
        (8 - Math.abs(node.y)) / Math.max(1e-10, Math.abs((dy * length) / Math.max(distance, 1e-10))),
      );
      node[other] =
        distance > 1e-10
          ? { x: node.x - ((dx * length) / distance) * ratio, y: node.y - ((dy * length) / distance) * ratio }
          : { x: node.x, y: node.y };
    }
    if (independent) node.mode = 'corner';
    node[selection.handle] = { ...point };
  }
  return result;
}

export function setVectorNodeMode(
  vector: ShapeVector,
  selection: VectorNodeSelection,
  mode: 'corner' | 'smooth',
): ShapeVector {
  const result = copy(vector),
    node = anchorAt(result, selection);
  node.mode = mode;
  if (mode === 'corner') {
    delete node.in;
    delete node.out;
    return result;
  }
  const contour = result.contours[selection.contour]!;
  const prev = contour.nodes[selection.node - 1] ?? (contour.closed ? contour.nodes.at(-1)! : node);
  const next = contour.nodes[selection.node + 1] ?? (contour.closed ? contour.nodes[0]! : node);
  const dx = (next.x - prev.x) / 6,
    dy = (next.y - prev.y) / 6;
  const ratio = Math.min(
    1,
    (8 - Math.abs(node.x)) / Math.max(1e-10, Math.abs(dx)),
    (8 - Math.abs(node.y)) / Math.max(1e-10, Math.abs(dy)),
  );
  node.in = { x: node.x - dx * ratio, y: node.y - dy * ratio };
  node.out = { x: node.x + dx * ratio, y: node.y + dy * ratio };
  return result;
}

/** De Casteljau subdivision retains the curve exactly, including the closing edge. */
export function insertVectorNode(vector: ShapeVector, selection: VectorNodeSelection, t = 0.5): ShapeVector {
  if (!Number.isFinite(t) || t <= 0 || t >= 1) throw new RangeError('Split must be inside a vector segment.');
  if (vector.contours.reduce((sum, c) => sum + c.nodes.length, 0) >= MAX_VECTOR_NODES)
    throw new RangeError('Vector node limit reached.');
  const result = copy(vector),
    start = anchorAt(result, selection),
    contour = result.contours[selection.contour]!;
  const end = contour.nodes[selection.node + 1] ?? (contour.closed ? contour.nodes[0] : undefined);
  if (!end) throw new RangeError('The last open anchor has no following segment.');
  const ids = new Set(result.contours.flatMap((c) => c.nodes.map((n) => n.id)));
  let nextId = 0;
  while (ids.has(`node-${nextId}`)) nextId++;
  if (start.out || end.in) {
    const a = mix(start, start.out ?? start, t),
      b = mix(start.out ?? start, end.in ?? end, t),
      c = mix(end.in ?? end, end, t);
    const d = mix(a, b, t),
      e = mix(b, c, t),
      position = mix(d, e, t);
    start.out = a;
    end.in = c;
    contour.nodes.splice(selection.node + 1, 0, { ...position, id: `node-${nextId}`, mode: 'smooth', in: d, out: e });
  } else {
    const position = mix(start, end, t);
    contour.nodes.splice(selection.node + 1, 0, {
      ...position,
      id: `node-${nextId}`,
      mode: 'smooth',
      in: mix(position, start, 1 / 3),
      out: mix(position, end, 1 / 3),
    });
    start.out = mix(start, position, 1 / 3);
    end.in = mix(end, position, 1 / 3);
  }
  return result;
}

export function removeVectorNode(vector: ShapeVector, selection: VectorNodeSelection): ShapeVector {
  anchorAt(vector, selection);
  if (vector.contours[selection.contour]!.nodes.length <= 2) return vector;
  const result = copy(vector);
  result.contours[selection.contour]!.nodes.splice(selection.node, 1);
  return result;
}

/** Expand the editable rectangle without moving the artwork, including 2D rotation. */
export function reframeVector(
  vector: ShapeVector,
  transform: NormalizedTransform,
  canvas: { width: number; height: number },
  rotation = 0,
) {
  const points = vector.contours.flatMap((c) =>
    c.nodes.flatMap((n) => [n, ...(n.in ? [n.in] : []), ...(n.out ? [n.out] : [])]),
  );
  const left = Math.min(0, ...points.map((p) => p.x)),
    top = Math.min(0, ...points.map((p) => p.y));
  const width = Math.max(1, ...points.map((p) => p.x)) - left,
    height = Math.max(1, ...points.map((p) => p.y)) - top;
  if (left === 0 && top === 0 && width === 1 && height === 1) return { vector, transform };
  const radians = (rotation * Math.PI) / 180;
  const dx = (left + width / 2 - 0.5) * transform.width * canvas.width;
  const dy = (top + height / 2 - 0.5) * transform.height * canvas.height;
  const nextWidth = transform.width * width,
    nextHeight = transform.height * height;
  const result = copy(vector);
  for (const contour of result.contours)
    for (const node of contour.nodes) {
      for (const p of [node, ...(node.in ? [node.in] : []), ...(node.out ? [node.out] : [])]) {
        p.x = (p.x - left) / width;
        p.y = (p.y - top) / height;
      }
    }
  return {
    vector: result,
    transform: {
      x:
        transform.x +
        transform.width / 2 +
        (dx * Math.cos(radians) - dy * Math.sin(radians)) / canvas.width -
        nextWidth / 2,
      y:
        transform.y +
        transform.height / 2 +
        (dx * Math.sin(radians) + dy * Math.cos(radians)) / canvas.height -
        nextHeight / 2,
      width: nextWidth,
      height: nextHeight,
    },
  };
}
