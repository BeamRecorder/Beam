import { describe, expect, it } from 'vitest';
import { vectorStrokePathData } from '../shape-vector-stroke';
import { vectorFromSvg, vectorPathData } from '../shape-vector-svg';
import { vectorMarkerPaths } from '../shape-vector-markers';
import { arrowVector } from '../shape-vector-presets';
import type { ArrowMarker } from '../shape-vector-types';

describe('arrow shafts end inside their tips', () => {
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
