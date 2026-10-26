import { describe, expect, it } from 'vitest';
import { vectorStrokePathData } from '../shape-vector-stroke';
import { vectorFromSvg, vectorPathData } from '../shape-vector-svg';
import { vectorMarkerPaths } from '../shape-vector-markers';
import { arrowVector } from '../shape-vector-presets';
import type { ArrowMarker } from '../shape-vector-types';
import { ARROW_CATALOG } from '../arrow-catalog';

describe('arrow shafts end inside their tips', () => {
  it.each(ARROW_CATALOG.map((definition) => definition.id))(
    'closes only bare ends of %s without changing the saved vector',
    (preset) => {
      const vector = arrowVector(preset),
        before = JSON.stringify(vector);
      const base = vectorFromSvg(vectorStrokePathData(vector, 300, 140, 1), 300, 140);
      const border = vectorFromSvg(vectorStrokePathData(vector, 300, 140, 1, 4), 300, 140);
      const source = vector.contours[0]!,
        original = base.contours[0]!.nodes,
        outlined = border.contours[0]!.nodes;
      const marked = vector.startMarker !== 'none' || vector.endMarker !== 'none';
      if (source.closed || !marked) expect(border).toEqual(base);
      else {
        const start = vector.startMarker === 'none',
          end = vector.endMarker === 'none';
        expect(outlined).toHaveLength(original.length + Number(start) + Number(end));
        expect(
          Math.hypot((outlined[0]!.x - original[0]!.x) * 300, (outlined[0]!.y - original[0]!.y) * 140),
        ).toBeCloseTo(start ? 4 : 0, 4);
        expect(
          Math.hypot((outlined.at(-1)!.x - original.at(-1)!.x) * 300, (outlined.at(-1)!.y - original.at(-1)!.y) * 140),
        ).toBeCloseTo(end ? 4 : 0, 4);
      }
      expect(JSON.stringify(vector)).toBe(before);
    },
  );

  it.each([0.5, 1, 2])('scales the border closure once at output scale %s', (scale) => {
    const vector = arrowVector('line');
    const fill = vectorFromSvg(vectorStrokePathData(vector, 300, 100, scale), 300, 100);
    const outline = vectorFromSvg(vectorStrokePathData(vector, 300, 100, scale, 6 * scale), 300, 100);
    expect((fill.contours[0]!.nodes[0]!.x - outline.contours[0]!.nodes[0]!.x) * 300).toBeCloseTo(6 * scale, 5);
    expect({ ...outline.contours[0]!.nodes.at(-1), id: '' }).toEqual({ ...fill.contours[0]!.nodes.at(-1), id: '' });
  });

  it('uses the pixel-space curve tangent at reversed, unmarked ends', () => {
    const vector = { ...vectorFromSvg('M.1 .5C.2 .2 .6 .2 .8 .8'), startMarker: 'triangle' as const };
    vector.contours[0]!.nodes.at(-1)!.out = { x: 1, y: 0 };
    const fill = vectorFromSvg(vectorStrokePathData(vector, 400, 50, 1), 400, 50);
    const outline = vectorFromSvg(vectorStrokePathData(vector, 400, 50, 1, 5), 400, 50);
    const tip = fill.contours[0]!.nodes.at(-1)!,
      cap = outline.contours[0]!.nodes.at(-1)!;
    expect(Math.hypot((cap.x - tip.x) * 400, (cap.y - tip.y) * 50)).toBeCloseTo(5, 4);
    expect(((cap.y - tip.y) * 50) / ((cap.x - tip.x) * 400)).toBeCloseTo(30 / 80, 4);
    expect(outline.contours[0]!.nodes.at(-2)!.out).toBeUndefined();
    expect(outline.contours[0]!.nodes[0]).toEqual(fill.contours[0]!.nodes[0]);
  });

  it('keeps degenerate endpoints finite and ignores zero-length handles', () => {
    const empty = { ...vectorFromSvg('M.5 .5L.5 .5'), endMarker: 'triangle' as const };
    expect(vectorStrokePathData(empty, 100, 50, 1, 5)).toBe('M50 25L50 25');
    const line = arrowVector('line'),
      start = line.contours[0]!.nodes[0]!;
    start.out = { x: start.x, y: start.y };
    start.in = { x: 1, y: 1 };
    const extended = vectorFromSvg(vectorStrokePathData(line, 100, 50, 1, 5), 100, 50);
    expect(extended.contours[0]!.nodes[0]!.x).toBe(0.03);
    expect(extended.contours[0]!.nodes[0]!.out).toBeUndefined();
  });

  it('uses the next distinct cubic control when an endpoint handle is collapsed', () => {
    const vector = { ...vectorFromSvg('M.2 .5C.2 .5 .4 .2 .8 .5'), endMarker: 'triangle' as const };
    const outline = vectorFromSvg(vectorStrokePathData(vector, 400, 100, 1, 5), 400, 100);
    const cap = outline.contours[0]!.nodes[0]!;
    const dx = (cap.x - 0.2) * 400,
      dy = (cap.y - 0.5) * 100;
    expect(Math.hypot(dx, dy)).toBeCloseTo(5, 4);
    expect(dy / dx).toBeCloseTo(-30 / 80, 4);
  });

  it('leaves a single-anchor arrow finite without inventing a tangent', () => {
    const vector = { ...vectorFromSvg('M.5 .5L.5 .5'), endMarker: 'triangle' as const };
    vector.contours[0]!.nodes.pop();
    expect(vectorStrokePathData(vector, 100, 50, 1, 5)).toBe('M50 25');
  });

  it.each(['triangle', 'open', 'circle'] as ArrowMarker[])(
    'removes the terminal shaft behind a %s tip',
    (endMarker) => {
      const v = { ...vectorFromSvg('M0 .5L1 .5'), endMarker };
      const path = vectorFromSvg(vectorStrokePathData(v, 100, 100, 1), 100, 100);
      expect(path.contours[0]!.nodes.at(-1)!.x).toBeLessThan(0.97);
      expect(v.contours[0]!.nodes.at(-1)!.x).toBe(1);
    },
  );
  it('trims both ends of reversed arrows and retains continuous curved joins', () => {
    const v = {
      ...vectorFromSvg('M1 .5L.99 .5C.7 0 .2 1 .01 .5L0 .5'),
      startMarker: 'triangle' as const,
      endMarker: 'triangle' as const,
    };
    const path = vectorFromSvg(vectorStrokePathData(v, 100, 100, 1), 100, 100);
    expect(path.contours[0]!.nodes[0]!.x).toBeLessThan(0.99);
    expect(path.contours[0]!.nodes.at(-1)!.x).toBeGreaterThan(0.01);
    expect(path.contours[0]!.nodes.at(-1)!.in).toBeDefined();
  });
  it('retains closed artwork, ordinary freehand strokes and degenerate strokes', () => {
    for (const data of ['M0 0L1 1', 'M0 0L1 0L1 1Z', 'M.5 .5L.5 .5']) {
      const v = vectorFromSvg(data);
      expect(vectorStrokePathData(v, 100, 50, 1)).toBe(vectorPathData(v, 100, 50));
    }
    const v = { ...vectorFromSvg('M.5 .5L.5 .5'), endMarker: 'triangle' as const };
    expect(vectorStrokePathData(v, 100, 50, 1)).toBe('M50 25L50 25');
  });
  it('keeps very short arrows valid even with large tips', () => {
    const v = { ...arrowVector('double'), markerSize: 120 };
    const path = vectorFromSvg(vectorStrokePathData(v, 10, 10, 1), 10, 10);
    const nodes = path.contours[0]!.nodes;
    expect(nodes[0]!.x).toBeLessThan(nodes.at(-1)!.x);
  });
  it('places circular tips entirely behind the terminal anchor in both directions', () => {
    const v = { ...arrowVector('line'), startMarker: 'circle' as const, endMarker: 'circle' as const };
    const markers = vectorFromSvg(vectorMarkerPaths(v, 100, 50, 1).filled, 100, 50);
    const xs = markers.contours.flatMap((c) => c.nodes.map((n) => n.x));
    expect(Math.min(...xs)).toBeCloseTo(v.contours[0]!.nodes[0]!.x);
    expect(Math.max(...xs)).toBeCloseTo(v.contours[0]!.nodes.at(-1)!.x);
  });
});
