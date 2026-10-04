import { describe, expect, it } from 'vitest';
import { simplifyVectorPoints } from '../shape-vector-simplify';
import { snapVectorPoint, closestVectorSegment } from '../shape-vector-hit';
import { splitVectorSegment, vectorSegment, vectorSegmentPoint } from '../shape-vector-segment';
import { drawingToVector } from '../shape-vector-drawing';
import { insertVectorNode } from '../shape-vector-edit';
import { isShapeVector, MAX_VECTOR_NODES } from '../shape-vector-schema';
import { vectorFromSvg } from '../shape-vector-svg';
import type { VectorNode, VectorSegment } from '../shape-vector-types';

describe('geometric freehand simplification', () => {
  it('reduces thousands of collinear samples to their two endpoints without modifying the gesture', () => {
    const points = Array.from({ length: 4000 }, (_, i) => ({ x: i / 3999, y: 0.3 }));
    const original = JSON.stringify(points);
    expect(simplifyVectorPoints(points, 1000, 500)).toEqual([points[0], points.at(-1)]);
    expect(JSON.stringify(points)).toBe(original);
  });
  it('retains large corners and loops while removing redundant samples', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
    ];
    expect(simplifyVectorPoints(square, 1000, 500)).toEqual([square[0], ...square.slice(2)]);
    expect(
      simplifyVectorPoints(
        [
          { x: 0.2, y: 0.2 },
          { x: 0.2, y: 0.2 },
          { x: 0.2, y: 0.2 },
        ],
        500,
        500,
      ),
    ).toHaveLength(2);
  });
  it.each([
    { points: [] },
    { points: [{ x: 0, y: 0 }] },
    {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    },
  ])('keeps short gestures intact', ({ points }) => {
    expect(simplifyVectorPoints(points, 1000, 500)).toEqual(points);
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid dimensions or tolerance %s', (value) => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 0.5 },
      { x: 1, y: 1 },
    ];
    for (const dimensions of [
      [value, 500, 2],
      [1000, value, 2],
      [1000, 500, value],
    ])
      expect(() => simplifyVectorPoints(points, ...(dimensions as [number, number, number]))).toThrow();
  });
  it('produces a small smooth editable arc with exact endpoints', () => {
    const points = Array.from({ length: 6000 }, (_, i) => {
      const t = i / 5999;
      return { x: t, y: 0.5 + 0.35 * Math.sin(t * Math.PI) };
    });
    const vector = drawingToVector({ points, smoothing: 65, strokeWidth: 8 }, 1000, 500);
    const nodes = vector.contours[0]!.nodes;
    expect(nodes.length).toBeLessThan(30);
    expect(nodes[0]).toMatchObject(points[0]!);
    expect(nodes.at(-1)).toMatchObject(points.at(-1)!);
    expect(nodes.every((n) => n.mode === 'smooth')).toBe(true);
    expect(isShapeVector(vector)).toBe(true);
  });
  it('bounds anchors for pathological unsmoothed gestures and handles zero-length tangents', () => {
    const points = Array.from({ length: 1800 }, (_, i) => ({ x: i / 1799, y: i % 2 }));
    const vector = drawingToVector({ points, smoothing: 0, strokeWidth: 1 }, 1000, 500);
    expect(vector.contours[0]!.nodes.length).toBeLessThanOrEqual(MAX_VECTOR_NODES);
    expect(isShapeVector(vector)).toBe(true);
    const duplicate = drawingToVector(
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        smoothing: 65,
        strokeWidth: 8,
      },
      1000,
      500,
    );
    expect(duplicate.contours[0]!.nodes[0]!.out).toBeUndefined();
  });
});

describe('anchor alignment', () => {
  it('snaps each axis to its nearest anchor and reports the two guide segments', () => {
    const result = snapVectorPoint({ x: 102, y: 197 }, [
      { x: 100, y: 40 },
      { x: 300, y: 200 },
      { x: 105, y: 190 },
    ]);
    expect(result.point).toEqual({ x: 100, y: 200 });
    expect(result.guides).toEqual([
      { from: { x: 100, y: 40 }, to: result.point },
      { from: { x: 300, y: 200 }, to: result.point },
    ]);
  });
  it('does not snap distant points, empty selections or disabled tolerances', () => {
    const p = { x: 50, y: 60 };
    for (const anchors of [[], [{ x: 100, y: 200 }]])
      expect(snapVectorPoint(p, anchors)).toEqual({ point: p, guides: [] });
    expect(snapVectorPoint(p, [{ x: 51, y: 61 }], 0).point).toEqual(p);
  });
  it('uses exact threshold matches and replaces a further candidate regardless of order', () => {
    expect(
      snapVectorPoint({ x: 10, y: 20 }, [
        { x: 16, y: 26 },
        { x: 11, y: 21 },
      ]).point,
    ).toEqual({ x: 11, y: 21 });
    expect(snapVectorPoint({ x: 10, y: 20 }, [{ x: 16, y: 26 }]).point).toEqual({ x: 16, y: 26 });
  });
});

describe('curve geometry and insertion', () => {
  const node = (x: number, y: number, extra: Partial<VectorNode> = {}): VectorNode => ({
    id: `${x}:${y}`,
    x,
    y,
    mode: 'smooth',
    ...extra,
  });
  const curve: VectorSegment = [
    { x: 0, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: 0 },
  ];
  it('constructs straight and partially authored cubic segments', () => {
    expect(vectorSegment(node(0, 0), node(3, 0))).toEqual([node(0, 0), { x: 1, y: 0 }, { x: 2, y: 0 }, node(3, 0)]);
    expect(vectorSegment(node(0, 0, { out: { x: 1, y: 2 } }), node(3, 0))[1]).toEqual({ x: 1, y: 2 });
    expect(vectorSegment(node(0, 0, { out: { x: 1, y: 2 } }), node(3, 0))[2]).toEqual(node(3, 0));
    expect(vectorSegment(node(0, 0), node(3, 0, { in: { x: 2, y: 3 } }))[2]).toEqual({ x: 2, y: 3 });
    expect(vectorSegment(node(0, 0), node(3, 0, { in: { x: 2, y: 3 } }))[1]).toEqual(node(0, 0));
  });
  it.each([0, 0.25, 0.5, 1])('subdivides a cubic at %s without changing its shape', (t) => {
    const [left, right] = splitVectorSegment(curve, t);
    for (const s of [0, 0.2, 0.8, 1]) {
      const expectedLeft = vectorSegmentPoint(curve, s * t),
        expectedRight = vectorSegmentPoint(curve, t + s * (1 - t));
      expect(vectorSegmentPoint(left, s).x).toBeCloseTo(expectedLeft.x, 10);
      expect(vectorSegmentPoint(left, s).y).toBeCloseTo(expectedLeft.y, 10);
      expect(vectorSegmentPoint(right, s).x).toBeCloseTo(expectedRight.x, 10);
      expect(vectorSegmentPoint(right, s).y).toBeCloseTo(expectedRight.y, 10);
    }
  });
  it('evaluates cubic extrema, degenerate curves and linear interpolation', () => {
    expect(vectorSegmentPoint(curve, 0.5)).toEqual({ x: 0.5, y: 0.75 });
    expect(
      vectorSegmentPoint(
        [
          { x: 1, y: 2 },
          { x: 1, y: 2 },
          { x: 1, y: 2 },
          { x: 1, y: 2 },
        ],
        0.5,
      ),
    ).toEqual({ x: 1, y: 2 });
    expect(vectorSegmentPoint(vectorSegment(node(0, 0), node(3, 3)), 0.25)).toEqual({ x: 0.75, y: 0.75 });
  });
  it('hits curves, disjoint contours and closed edges with pixel distances', () => {
    const v = vectorFromSvg('M0 0C0 1 1 1 1 0M2 0L3 0L3 1Z');
    expect(closestVectorSegment(v, { x: 0.5, y: 0.75 }, 100, 100)).toMatchObject({ contour: 0, node: 0 });
    expect(closestVectorSegment(v, { x: 2.5, y: 0 }, 100, 100)?.distance).toBeLessThan(0.01);
    expect(closestVectorSegment(v, { x: 2.5, y: 0.5 }, 100, 100)).toMatchObject({ contour: 1, node: 2 });
    expect(closestVectorSegment({ ...v, contours: [] }, { x: 0, y: 0 }, 100, 100)).toBeNull();
  });
  it('inserts smooth points on straight lines without bending or stretching their geometry', () => {
    const v = vectorFromSvg('M0 0L1 1'),
      next = insertVectorNode(v, { contour: 0, node: 0 }, 0.3);
    const nodes = next.contours[0]!.nodes;
    expect(nodes[1]).toMatchObject({ mode: 'smooth', x: 0.3, y: 0.3 });
    expect(nodes[1]!.in).toBeDefined();
    expect(nodes[1]!.out).toBeDefined();
    expect(v.contours[0]!.nodes).toHaveLength(2);
    for (let i = 0; i < 2; i++)
      for (const t of [0.25, 0.5, 0.75]) {
        const p = vectorSegmentPoint(vectorSegment(nodes[i]!, nodes[i + 1]!), t);
        expect(p.x).toBeCloseTo(p.y, 10);
      }
  });
});
