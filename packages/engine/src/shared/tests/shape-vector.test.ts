import { describe, expect, it } from 'vitest';
import { vectorFromSvg, vectorPathData } from '../shape-vector-svg';
import { arrowVector, vectorForShape, solidArrowPath } from '../shape-vector-presets';
import { drawingToVector } from '../shape-vector-drawing';
import { isShapeVector, MAX_VECTOR_NODES } from '../shape-vector-schema';
import {
  moveVectorPoint,
  setVectorNodeMode,
  insertVectorNode,
  removeVectorNode,
  reframeVector,
} from '../shape-vector-edit';
import { vectorMarkerPaths } from '../shape-vector-markers';
import { SHAPE_CATALOG } from '../shape-catalog';
import { normalizeShapeLayerStyle, isShapeLayerStyle } from '../shape-layer-style';
import type { ShapeClip } from '../composition-types';
import type { ShapeVector } from '../shape-vector-types';
const selection = { contour: 0, node: 0 };
const line = () => vectorFromSvg('M0 0L1 1');
const curve = () => vectorFromSvg('M0 0C.2 .8 .7 .1 1 1');
const clip = (preset = 'rectangle') =>
  ({
    ...normalizeShapeLayerStyle({ preset: preset as ShapeClip['preset'] }),
    transform: { x: 0.2, y: 0.2, width: 0.4, height: 0.3 },
  }) as ShapeClip;
const transform = { x: 0.2, y: 0.2, width: 0.4, height: 0.3 };
const canvas = { width: 1600, height: 1000 };

describe('portable vector paths', () => {
  it.each(SHAPE_CATALOG)('converts catalog $id without losing contours or fill rules', (shape) => {
    const v = vectorFromSvg(shape.path, shape.width, shape.height, shape.fillRule);
    expect(isShapeVector(v)).toBe(true);
    expect(isShapeVector(vectorFromSvg(vectorPathData(v)))).toBe(true);
  });
  it('normalizes relative, horizontal, vertical, quadratic, smooth and arc commands', () => {
    const v = vectorFromSvg('m0 0h20v10q5 5 10 0t10 0a10 10 0 0 1 10 10s5 5 10 0z', 100, 100);
    expect(v.contours[0]!.closed).toBe(true);
    expect(v.contours[0]!.nodes.some((n) => n.in || n.out)).toBe(true);
  });
  it('retains independent contours and a curved closing edge', () => {
    const v = vectorFromSvg('M0 0L1 0C1 1 .2 .5 0 0ZM.2 .2L.4 .4', 1, 1, 'evenodd');
    expect(v.contours).toHaveLength(2);
    expect(v.contours[0]!.nodes).toHaveLength(2);
    expect(v.contours[0]!.nodes[0]!.in).toEqual({ x: 0.2, y: 0.5 });
    expect(vectorPathData(v)).toContain('C1 1 0.2 0.5 0 0Z');
    expect(v.fillRule).toBe('evenodd');
  });
  it.each(['', 'Z', 'L1 1', 'M0 0', 'M0 0L99 99', 'invalid', ' '.repeat(100001)])(
    'rejects invalid or oversized source %j',
    (path) => expect(() => vectorFromSvg(path)).toThrow(),
  );
  it.each([0, -1, NaN, Infinity])('rejects dimensions %s', (dimension) => {
    expect(() => vectorFromSvg('M0 0L1 1', dimension)).toThrow();
    expect(() => vectorFromSvg('M0 0L1 1', 1, dimension)).toThrow();
  });
  it('serializes lines, curves, missing handles and closed paths deterministically', () => {
    const v = vectorFromSvg('M0 0L1 0L1 1Z');
    expect(vectorPathData(v, 10, 20)).toBe('M0 0L10 0L10 20L0 0Z');
    v.contours[0]!.nodes[0]!.out = { x: 0.333333333, y: 0 };
    expect(vectorPathData(v)).toContain('C0.33333 0 1 0 1 0');
    delete v.contours[0]!.nodes[0]!.out;
    v.contours[0]!.nodes[1]!.in = { x: 0.5, y: 0 };
    expect(vectorPathData(v)).toContain('C0 0 0.5 0 1 0');
  });
});
describe('vector validation', () => {
  it('accepts valid geometry, explicit reset, and unchanged identity', () => {
    const vector = curve();
    expect(normalizeShapeLayerStyle({ vector }).vector).toBe(vector);
    expect(isShapeLayerStyle(normalizeShapeLayerStyle({ vector }))).toBe(true);
    expect(isShapeLayerStyle(normalizeShapeLayerStyle({ vector: null }))).toBe(true);
  });
  it.each(['version', 'contours', 'fillRule', 'strokeWidth', 'startMarker', 'endMarker', 'markerSize', 'arrowPreset'])(
    'rejects malformed %s',
    (key) => {
      const v = { ...line(), [key]: key === 'contours' ? [] : 'invalid' };
      expect(isShapeVector(v)).toBe(false);
      expect(isShapeLayerStyle({ ...normalizeShapeLayerStyle({}), vector: v as ShapeVector })).toBe(false);
      expect(() => normalizeShapeLayerStyle({ vector: v as ShapeVector })).toThrow();
    },
  );
  it.each([
    null,
    {},
    { contours: null },
    { ...line(), contours: Array(65).fill(line().contours[0]) },
    { ...line(), strokeWidth: 0 },
    { ...line(), markerSize: 121 },
  ])('rejects malformed document %j', (v) => expect(isShapeVector(v)).toBe(false));
  it.each(['id', 'mode', 'x', 'y', 'in', 'out'])('rejects malformed node %s', (key) => {
    const v = line();
    Object.assign(v.contours[0]!.nodes[0]!, { [key]: key === 'id' ? '' : key === 'mode' ? 'bad' : null });
    expect(isShapeVector(v)).toBe(false);
  });
  it('rejects duplicate ids, absent contours, nonfinite handles, short and oversized contours', () => {
    const v = line();
    v.contours[0]!.nodes[1]!.id = v.contours[0]!.nodes[0]!.id;
    expect(isShapeVector(v)).toBe(false);
    expect(isShapeVector({ ...v, contours: [null] })).toBe(false);
    expect(isShapeVector({ ...v, contours: [{ closed: 'bad', nodes: [] }] })).toBe(false);
    expect(isShapeVector({ ...v, contours: [{ closed: false, nodes: [v.contours[0]!.nodes[0]] }] })).toBe(false);
    const large = line();
    large.contours[0]!.nodes = Array.from({ length: MAX_VECTOR_NODES + 1 }, (_, i) => ({
      id: `${i}`,
      x: 0,
      y: 0,
      mode: 'corner',
    }));
    expect(isShapeVector(large)).toBe(false);
  });
});
describe('point editing', () => {
  it('moves an anchor with both handles, immutably', () => {
    const v = setVectorNodeMode(curve(), { contour: 0, node: 1 }, 'smooth'),
      before = structuredClone(v);
    const moved = moveVectorPoint(v, { contour: 0, node: 1 }, { x: 0.5, y: 0.8 });
    expect(v).toEqual(before);
    expect(moved.contours[0]!.nodes[1]!.in!.x).toBeCloseTo(v.contours[0]!.nodes[1]!.in!.x - 0.5);
    expect(moved.contours[0]!.nodes[1]!.out!.y).toBeCloseTo(v.contours[0]!.nodes[1]!.out!.y - 0.2);
  });
  it('keeps smooth opposite handles collinear and supports independent Alt handles', () => {
    const v = setVectorNodeMode(curve(), selection, 'smooth');
    const moved = moveVectorPoint(v, { ...selection, handle: 'out' }, { x: 0.2, y: 0.4 });
    const n = moved.contours[0]!.nodes[0]!;
    expect(n.in!.x / n.in!.y).toBeCloseTo(0.5);
    const independent = moveVectorPoint(v, { ...selection, handle: 'in' }, { x: -0.4, y: -0.2 }, true);
    expect(independent.contours[0]!.nodes[0]!.mode).toBe('corner');
    expect(independent.contours[0]!.nodes[0]!.out).toEqual(v.contours[0]!.nodes[0]!.out);
    expect(moveVectorPoint(v, { ...selection, handle: 'out' }, { x: 0, y: 0 }).contours[0]!.nodes[0]!.in).toEqual({
      x: 0,
      y: 0,
    });
    expect(
      moveVectorPoint(line(), { ...selection, handle: 'out' }, { x: 0.1, y: 0.1 }).contours[0]!.nodes[0]!.out,
    ).toEqual({ x: 0.1, y: 0.1 });
  });
  it('rejects unknown anchors and out-of-range points', () => {
    expect(() => moveVectorPoint(line(), { contour: 3, node: 0 }, { x: 0, y: 0 })).toThrow();
    for (const x of [9, NaN, Infinity]) expect(() => moveVectorPoint(line(), selection, { x, y: 0 })).toThrow();
  });
  it('creates smooth endpoint and loop handles and removes them for corners', () => {
    const v = vectorFromSvg('M0 0L1 0L1 1Z');
    expect(setVectorNodeMode(v, selection, 'smooth').contours[0]!.nodes[0]!.in).toEqual({ x: 0, y: 1 / 6 });
    expect(setVectorNodeMode(v, { contour: 0, node: 2 }, 'smooth').contours[0]!.nodes[2]!.out).toBeDefined();
    const smooth = setVectorNodeMode(line(), selection, 'smooth');
    expect(setVectorNodeMode(smooth, selection, 'corner').contours[0]!.nodes[0]!.in).toBeUndefined();
    expect(() => setVectorNodeMode(v, { contour: 0, node: 5 }, 'smooth')).toThrow();
  });
  it('splits lines and cubic curves exactly, with unique node ids', () => {
    const v = curve(),
      split = insertVectorNode(v, selection);
    expect(split.contours[0]!.nodes[1]!.x).toBeCloseTo(0.4625);
    expect(split.contours[0]!.nodes[1]!.y).toBeCloseTo(0.4625);
    expect(insertVectorNode(line(), selection).contours[0]!.nodes[1]!.x).toBe(0.5);
    const oneHandle = line();
    oneHandle.contours[0]!.nodes[1]!.in = { x: 0.4, y: 0.3 };
    expect(isShapeVector(insertVectorNode(oneHandle, selection))).toBe(true);
    const otherHandle = line();
    otherHandle.contours[0]!.nodes[0]!.out = { x: 0.3, y: 0.4 };
    expect(isShapeVector(insertVectorNode(otherHandle, selection))).toBe(true);
    const closed = vectorFromSvg('M0 0L1 0L1 1Z');
    expect(insertVectorNode(closed, { contour: 0, node: 2 }).contours[0]!.nodes[3]!.x).toBe(0.5);
  });
  it('rejects invalid segment splits and bounded node overflow', () => {
    for (const t of [0, 1, -1, NaN]) expect(() => insertVectorNode(line(), selection, t)).toThrow();
    expect(() => insertVectorNode(line(), { contour: 0, node: 1 })).toThrow();
    const v = line();
    v.contours[0]!.nodes = Array.from({ length: MAX_VECTOR_NODES }, (_, i) => ({
      id: `${i}`,
      x: 0,
      y: 0,
      mode: 'corner',
    }));
    expect(() => insertVectorNode(v, selection)).toThrow();
  });
  it('removes nodes without deleting the last two or mutating source', () => {
    const v = vectorFromSvg('M0 0L1 0L1 1Z');
    expect(removeVectorNode(v, selection).contours[0]!.nodes).toHaveLength(2);
    expect(v.contours[0]!.nodes).toHaveLength(3);
    const two = line();
    expect(removeVectorNode(two, selection)).toBe(two);
    expect(() => removeVectorNode(two, { contour: 2, node: 1 })).toThrow();
  });
  it('preserves geometry when extending bounds, including rotation and handles', () => {
    const v = line();
    expect(reframeVector(v, transform, canvas)).toEqual({ vector: v, transform });
    const moved = moveVectorPoint(v, selection, { x: -0.5, y: -0.5 });
    moved.contours[0]!.nodes[0]!.in = { x: -0.6, y: -0.8 };
    moved.contours[0]!.nodes[0]!.out = { x: -0.3, y: -0.2 };
    for (const rotation of [0, 90, 33]) {
      const framed = reframeVector(moved, transform, canvas, rotation);
      const world = (p: { x: number; y: number }, t: typeof transform) => {
        const angle = (rotation * Math.PI) / 180,
          x = (p.x - 0.5) * t.width * canvas.width,
          y = (p.y - 0.5) * t.height * canvas.height;
        return {
          x: (t.x + t.width / 2) * canvas.width + x * Math.cos(angle) - y * Math.sin(angle),
          y: (t.y + t.height / 2) * canvas.height + x * Math.sin(angle) + y * Math.cos(angle),
        };
      };
      expect(world(framed.vector.contours[0]!.nodes[0]!, framed.transform).x).toBeCloseTo(
        world(moved.contours[0]!.nodes[0]!, transform).x,
      );
      expect(world(framed.vector.contours[0]!.nodes[0]!, framed.transform).y).toBeCloseTo(
        world(moved.contours[0]!.nodes[0]!, transform).y,
      );
      expect(framed.vector.contours[0]!.nodes[0]!.in!.y).toBe(0);
    }
  });
});
describe('arrow presets and drawing', () => {
  it.each(['solid', 'line', 'double', 'curved', 'elbow'] as const)('creates editable %s arrows', (preset) =>
    expect(isShapeVector(arrowVector(preset))).toBe(true),
  );
  it('keeps legacy solid-arrow geometry and native conversion dimensions', () => {
    expect(solidArrowPath(36, 38)).toContain('L1 .5');
    for (const preset of ['rectangle', 'rounded-rectangle', 'ellipse', 'triangle', 'diamond', 'star', 'heart'])
      expect(isShapeVector(vectorForShape(clip(preset), canvas))).toBe(true);
    const arrow = clip('arrow');
    arrow.family = 'arrow';
    expect(vectorPathData(vectorForShape(arrow, canvas))).toBe(
      vectorPathData(vectorFromSvg(solidArrowPath(arrow.arrowThickness, arrow.arrowHeadSize))),
    );
    arrow.vector = line();
    expect(vectorForShape(arrow, canvas)).toBe(arrow.vector);
    const text = clip('text');
    text.family = 'text';
    expect(() => vectorForShape(text, canvas)).toThrow();
    arrow.drawing = {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      strokeWidth: 8,
      smoothing: 0,
    };
    arrow.vector = null;
    expect(vectorForShape(arrow, canvas).strokeWidth).toBe(8);
  });
  it('retains endpoints, caps drawn nodes, and supports smoothing', () => {
    const points = Array.from({ length: 2000 }, (_, i) => ({ x: i / 1999, y: 0.5 + Math.sin(i / 90) * 0.2 }));
    for (const smoothing of [0, 65, 100]) {
      const v = drawingToVector({ points, smoothing, strokeWidth: 12 }, 800, 500);
      expect(v.contours[0]!.nodes.length).toBeLessThanOrEqual(256);
      expect(v.contours[0]!.nodes[0]!.x).toBe(0);
      expect(v.contours[0]!.nodes.at(-1)!.x).toBe(1);
      expect(Boolean(v.contours[0]!.nodes[0]!.out)).toBe(smoothing > 0);
    }
    expect(() => drawingToVector({ points: [{ x: 0, y: 0 }], smoothing: 0, strokeWidth: 2 }, 100, 100)).toThrow();
  });
  it.each(['triangle', 'open', 'circle'] as const)(
    'builds %s tips from the terminal tangent, without NaN coordinates',
    (marker) => {
      const v = curve();
      v.startMarker = marker;
      v.endMarker = marker;
      let paths = vectorMarkerPaths(v, 100, 50, 1);
      expect(paths.filled + paths.outlined).not.toContain('NaN');
      expect(paths.filled + paths.outlined).not.toBe('');
      v.contours[0]!.nodes[0]!.out = { x: 0, y: 0 };
      v.contours[0]!.nodes.at(-1)!.in = { x: 1, y: 1 };
      paths = vectorMarkerPaths(v, 100, 50, 1);
      expect(paths.filled + paths.outlined).not.toContain('NaN');
    },
  );
  it('omits markers from closed paths, unmarked paths and zero-length tangents', () => {
    for (const v of [
      line(),
      {
        ...line(),
        startMarker: 'triangle' as const,
        endMarker: 'open' as const,
        contours: [
          {
            closed: false,
            nodes: [
              { id: 'a', x: 0, y: 0, mode: 'corner' as const },
              { id: 'b', x: 0, y: 0, mode: 'corner' as const },
            ],
          },
        ],
      },
      { ...arrowVector('solid'), endMarker: 'triangle' as const },
    ])
      expect(vectorMarkerPaths(v, 100, 50, 1)).toEqual({ filled: '', outlined: '' });
  });
});

it('keeps linked control points inside the persisted coordinate limits at extreme drags', () => {
  const v = curve();
  v.contours[0]!.nodes[0]!.in = { x: -7, y: -7 };
  v.contours[0]!.nodes[0]!.mode = 'smooth';
  const moved = moveVectorPoint(v, selection, { x: 8, y: 8 });
  expect(isShapeVector(moved)).toBe(true);
  const handle = moveVectorPoint(moved, { ...selection, handle: 'out' }, { x: -8, y: -8 });
  expect(isShapeVector(handle)).toBe(true);
  const corner = vectorFromSvg('M8 8L-8 -8');
  expect(isShapeVector(setVectorNodeMode(corner, selection, 'smooth'))).toBe(true);
});
