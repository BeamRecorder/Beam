import { SVGPathData } from 'svg-pathdata';
import type { ShapeVector, VectorContour, VectorNode, VectorPoint } from './shape-vector-types';
import { isShapeVector } from './shape-vector-schema';

export function vectorFromSvg(
  path: string,
  width = 1,
  height = 1,
  fillRule: ShapeVector['fillRule'] = 'nonzero',
): ShapeVector {
  if (
    !path ||
    path.length > 100_000 ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new TypeError('Invalid vector path dimensions.');
  const commands = new SVGPathData(path).toAbs().normalizeHVZ(false, true, true).normalizeST().qtToC().aToC().commands;
  const contours: VectorContour[] = [];
  let contour: VectorContour | null = null;
  let nextId = 0;
  const point = (x: number, y: number): VectorPoint => ({ x: x / width, y: y / height });
  for (const command of commands) {
    if (command.type === SVGPathData.MOVE_TO) {
      contour = { closed: false, nodes: [{ ...point(command.x, command.y), id: `node-${nextId++}`, mode: 'corner' }] };
      contours.push(contour);
    } else if (command.type === SVGPathData.CLOSE_PATH) {
      if (!contour) throw new TypeError('Vector close command has no contour.');
      contour.closed = true;
      const first = contour.nodes[0]!,
        last = contour.nodes.at(-1)!;
      if (contour.nodes.length > 2 && Math.hypot(first.x - last.x, first.y - last.y) < 1e-8) {
        if (last.in) first.in = last.in;
        contour.nodes.pop();
      }
    } else if (command.type === SVGPathData.LINE_TO || command.type === SVGPathData.CURVE_TO) {
      if (!contour) throw new TypeError('Vector segment has no contour.');
      const next: VectorNode = { ...point(command.x, command.y), id: `node-${nextId++}`, mode: 'corner' };
      if (command.type === SVGPathData.CURVE_TO) {
        contour.nodes.at(-1)!.out = point(command.x1, command.y1);
        next.in = point(command.x2, command.y2);
      }
      contour.nodes.push(next);
    }
  }
  const vector: ShapeVector = {
    version: 1,
    contours,
    fillRule,
    strokeWidth: 8,
    startMarker: 'none',
    endMarker: 'none',
    markerSize: 18,
  };
  if (!isShapeVector(vector)) throw new TypeError('Unsupported or oversized vector path.');
  return vector;
}

export function vectorPathData(vector: ShapeVector, width = 1, height = 1): string {
  const number = (n: number) => Math.round(n * 100_000) / 100_000;
  const point = (p: VectorPoint) => `${number(p.x * width)} ${number(p.y * height)}`;
  return vector.contours
    .map(({ nodes, closed }) => {
      let data = `M${point(nodes[0]!)}`;
      for (let i = 1; i <= nodes.length - (closed ? 0 : 1); i++) {
        const previous = nodes[i - 1]!,
          next = nodes[i % nodes.length]!;
        data +=
          previous.out || next.in
            ? `C${point(previous.out ?? previous)} ${point(next.in ?? next)} ${point(next)}`
            : `L${point(next)}`;
      }
      return data + (closed ? 'Z' : '');
    })
    .join('');
}
