import { describe, expect, it } from 'vitest';
import { finishAnchorPath } from '../shape-vector-anchors';
import { ARROW_CATALOG, arrowDefinition } from '../arrow-catalog';
import { ARROW_VECTOR_PRESETS, isShapeVector, MAX_VECTOR_NODES } from '../shape-vector-schema';
import { arrowVector } from '../shape-vector-presets';
import { vectorPathData } from '../shape-vector-svg';
import type { ArrowPreset, VectorNode } from '../shape-vector-types';
const canvas = { width: 1920, height: 1080 };
const nodes = (): VectorNode[] => [
  { id: 'a', x: 0.1, y: 0.2, mode: 'corner' },
  { id: 'b', x: 0.5, y: 0.4, mode: 'smooth', in: { x: 0.3, y: 0.1 }, out: { x: 0.7, y: 0.7 } },
  { id: 'c', x: 0.9, y: 0.8, mode: 'corner' },
];
describe('manual vector anchors', () => {
  it('retains exactly the authored nodes and handles without sampling or mutation', () => {
    const input = nodes(),
      before = structuredClone(input);
    const result = finishAnchorPath(input, 8, canvas)!;
    expect(isShapeVector(result.vector)).toBe(true);
    expect(result.vector).toMatchObject({ startMarker: 'none', endMarker: 'triangle', strokeWidth: 8 });
    expect(result.vector.contours[0]!.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    const t = result.transform;
    result.vector.contours[0]!.nodes.forEach((n, index) => {
      expect(n.x * t.width + t.x).toBeCloseTo(input[index]!.x);
      expect(n.y * t.height + t.y).toBeCloseTo(input[index]!.y);
      for (const key of ['in', 'out'] as const)
        if (n[key]) {
          expect(n[key]!.x * t.width + t.x).toBeCloseTo(input[index]![key]!.x);
          expect(n[key]!.y * t.height + t.y).toBeCloseTo(input[index]![key]!.y);
        }
    });
    expect(input).toEqual(before);
    expect(result.vector.contours[0]!.nodes[1]!.in).not.toBe(input[1]!.in);
  });
  it.each([[], nodes().slice(0, 1), [nodes()[0]!, { ...nodes()[0]!, id: 'second' }]].map((input) => ({ input })))(
    'rejects unfinished or collapsed paths %#',
    ({ input }) => {
      expect(finishAnchorPath(input, 8, canvas)).toBeNull();
    },
  );
  it.each([0, -1, NaN, Infinity])('rejects invalid canvas dimensions %s', (dimension) => {
    expect(finishAnchorPath(nodes(), 8, { width: dimension, height: 1080 })).toBeNull();
    expect(finishAnchorPath(nodes(), 8, { width: 1920, height: dimension })).toBeNull();
  });
  it.each([0, 121, NaN])('rejects invalid stroke widths %s', (width) =>
    expect(finishAnchorPath(nodes(), width, canvas)).toBeNull(),
  );
  it('rejects duplicate identities and out-of-bound coordinates or handles', () => {
    expect(finishAnchorPath([...nodes(), nodes()[0]!], 8, canvas)).toBeNull();
    expect(finishAnchorPath([{ ...nodes()[0]!, x: 9 }, nodes()[1]!], 8, canvas)).toBeNull();
    expect(finishAnchorPath([{ ...nodes()[0]!, in: { x: NaN, y: 0 } }, nodes()[1]!], 8, canvas)).toBeNull();
  });
  it('includes Bézier handles outside the canvas and reserves room for the tip', () => {
    const input = nodes();
    input[1]!.out = { x: 1.5, y: -0.5 };
    const result = finishAnchorPath(input, 120, canvas)!;
    expect(result.transform.y).toBeLessThan(-0.5);
    expect(result.transform.x + result.transform.width).toBeGreaterThan(1.5);
    expect(result.vector.contours[0]!.nodes[1]!.out!.x).toBeLessThan(1);
  });
  it('handles extreme dimensions without producing non-finite layer geometry', () => {
    expect(
      finishAnchorPath(nodes(), 120, { width: Number.MAX_VALUE, height: Number.MAX_VALUE })!.transform.width,
    ).toBeGreaterThan(0);
    expect(finishAnchorPath(nodes(), 8, { width: Number.MIN_VALUE, height: Number.MIN_VALUE })).toBeNull();
    expect(finishAnchorPath(nodes(), 8, { width: 1, height: 16000 })!.transform.width).toBeGreaterThan(0);
  });
  it('accepts the authored limit and never silently drops nodes beyond it', () => {
    const input: VectorNode[] = Array.from({ length: MAX_VECTOR_NODES }, (_, i) => ({
      id: `n${i}`,
      x: i / MAX_VECTOR_NODES,
      y: 0.5,
      mode: 'corner',
    }));
    expect(finishAnchorPath(input, 1, canvas)!.vector.contours[0]!.nodes).toHaveLength(MAX_VECTOR_NODES);
    expect(finishAnchorPath([...input, { ...input[0]!, id: 'extra' }], 1, canvas)).toBeNull();
  });
});
describe('arrow catalogue', () => {
  it('exposes thirty distinct recipes accepted by project storage', () => {
    expect(ARROW_CATALOG).toHaveLength(30);
    expect(ARROW_CATALOG.map((d) => d.id)).toEqual(ARROW_VECTOR_PRESETS);
    const recipes = ARROW_CATALOG.map((d) => {
      const vector = arrowVector(d.id);
      expect(isShapeVector(vector)).toBe(true);
      expect(d.aspectRatio).toBeGreaterThan(0);
      return `${vectorPathData(vector)}:${vector.startMarker}:${vector.endMarker}`;
    });
    expect(new Set(recipes).size).toBe(30);
  });
  it.each(ARROW_CATALOG)('resolves $id by identity', (definition) =>
    expect(arrowDefinition(definition.id)).toBe(definition),
  );
  it('rejects unknown presets rather than changing the artwork', () => {
    expect(() => arrowDefinition('unknown' as ArrowPreset)).toThrow('Unknown arrow preset');
    expect(() => arrowVector('unknown' as ArrowPreset)).toThrow('Unknown arrow preset');
  });
});
