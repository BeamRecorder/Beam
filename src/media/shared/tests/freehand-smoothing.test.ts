import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAWING_SETTINGS, finishDrawing } from '../freehand';
import { smoothFreehandPoints } from '../freehand-smoothing';
import type { DrawingPoint } from '../element-types';

const loop = (count: number, radiusX: number, radiusY = radiusX): DrawingPoint[] =>
  Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / (count - 1);
    return { x: 0.5 + radiusX * Math.cos(angle), y: 0.5 + radiusY * Math.sin(angle) };
  });

const noisyCircle = (count: number): DrawingPoint[] =>
  loop(count, 0.34).map((point, index) => {
    const noise = 0.03 * Math.sin((2 * Math.PI * 47 * index) / (count - 1));
    return {
      x: 0.5 + (point.x - 0.5) * (1 + noise / 0.34),
      y: 0.5 + (point.y - 0.5) * (1 + noise / 0.34),
    };
  });

const radialVariation = (points: readonly DrawingPoint[], width: number, height: number) => {
  const radii = points.map((point) => Math.hypot((point.x - 0.5) * width, (point.y - 0.5) * height));
  const mean = radii.reduce((sum, radius) => sum + radius, 0) / Math.max(1, radii.length);
  const variance = radii.reduce((sum, radius) => sum + (radius - mean) ** 2, 0) / Math.max(1, radii.length);
  return { mean, deviation: Math.sqrt(variance) };
};

const tangentAlignmentAtLoopSeam = (points: readonly DrawingPoint[], width: number, height: number) => {
  const first = points[0]!;
  const afterFirst = points[1]!;
  const beforeLast = points.at(-2)!;
  const last = points.at(-1)!;
  const start = { x: (afterFirst.x - first.x) * width, y: (afterFirst.y - first.y) * height };
  const end = { x: (last.x - beforeLast.x) * width, y: (last.y - beforeLast.y) * height };
  return (start.x * end.x + start.y * end.y) / (Math.hypot(start.x, start.y) * Math.hypot(end.x, end.y));
};

describe('smoothFreehandPoints', () => {
  it('rounds a noisy closed circle while retaining its radius and a smooth seam', () => {
    const input = noisyCircle(1_024);
    const before = radialVariation(input, 1_000, 1_000);
    const smoothed = smoothFreehandPoints(input, 95, 1_000, 1_000);
    const after = radialVariation(smoothed, 1_000, 1_000);

    expect(smoothed.length).toBeGreaterThan(32);
    expect(after.deviation).toBeLessThan(before.deviation * 0.55);
    expect(after.mean).toBeGreaterThan(before.mean * 0.95);
    expect(tangentAlignmentAtLoopSeam(smoothed, 1_000, 1_000)).toBeGreaterThan(0.5);
  });

  it('applies stronger smoothing at a higher setting', () => {
    const input = noisyCircle(768);
    const original = radialVariation(input, 1_000, 1_000).deviation;
    const light = smoothFreehandPoints(input, 20, 1_000, 1_000);
    const strong = smoothFreehandPoints(input, 90, 1_000, 1_000);

    expect(radialVariation(strong, 1_000, 1_000).deviation).toBeLessThan(
      radialVariation(light, 1_000, 1_000).deviation,
    );
    expect(radialVariation(strong, 1_000, 1_000).deviation).toBeLessThan(original);
  });

  it('preserves open endpoints exactly and never mutates its input', () => {
    const input = Object.freeze([
      Object.freeze({ x: 0.08, y: 0.72 }),
      Object.freeze({ x: 0.2, y: 0.55 }),
      Object.freeze({ x: 0.43, y: 0.37 }),
      Object.freeze({ x: 0.68, y: 0.49 }),
      Object.freeze({ x: 0.91, y: 0.23 }),
    ]);
    const original = input.map((point) => ({ ...point }));
    const output = smoothFreehandPoints(input, 85, 1_200, 500);

    expect(output[0]).toEqual(input[0]);
    expect(output.at(-1)).toEqual(input.at(-1));
    expect(input).toEqual(original);
  });

  it('keeps the same physical trajectory after finishDrawing on differently shaped canvases', () => {
    const source = Array.from({ length: 80 }, (_, index) => ({
      x: 40 + index * 2.7,
      y: 55 + index * 1.3 + 22 * Math.sin(index / 7),
    }));
    const canvasA = { width: 1_000, height: 320 };
    const canvasB = { width: 320, height: 1_000 };
    const inputA = source.map((point) => ({ x: point.x / canvasA.width, y: point.y / canvasA.height }));
    const inputB = source.map((point) => ({ x: point.x / canvasB.width, y: point.y / canvasB.height }));
    const smoothedA = smoothFreehandPoints(inputA, 75, canvasA.width, canvasA.height);
    const smoothedB = smoothFreehandPoints(inputB, 75, canvasB.width, canvasB.height);
    const restoredA = smoothedA.map((point) => ({ x: point.x * canvasA.width, y: point.y * canvasA.height }));
    const restoredB = smoothedB.map((point) => ({ x: point.x * canvasB.width, y: point.y * canvasB.height }));

    expect(restoredA).toHaveLength(restoredB.length);
    restoredA.forEach((point, index) => {
      expect(point.x).toBeCloseTo(restoredB[index]!.x, 2);
      expect(point.y).toBeCloseTo(restoredB[index]!.y, 2);
    });
    const finished = finishDrawing(inputA, DEFAULT_DRAWING_SETTINGS, canvasA)!;
    const committed = smoothFreehandPoints(
      finished.drawing.points,
      75,
      finished.transform.width * canvasA.width,
      finished.transform.height * canvasA.height,
    );
    expect(committed).toHaveLength(smoothedA.length);
    committed.forEach((point, index) => {
      expect(finished.transform.x + point.x * finished.transform.width).toBeCloseTo(smoothedA[index]!.x, 8);
      expect(finished.transform.y + point.y * finished.transform.height).toBeCloseTo(smoothedA[index]!.y, 8);
    });
  });

  it('keeps an ellipse visibly elliptical instead of snapping it to a circle', () => {
    const input = loop(512, 0.36, 0.18);
    const output = smoothFreehandPoints(input, 85, 1_000, 1_000);
    const xs = output.map((point) => point.x * 1_000);
    const ys = output.map((point) => point.y * 1_000);
    const horizontalRadius = (Math.max(...xs) - Math.min(...xs)) / 2;
    const verticalRadius = (Math.max(...ys) - Math.min(...ys)) / 2;

    expect(verticalRadius / horizontalRadius).toBeLessThan(0.7);
  });

  it('returns the original trajectory at zero smoothing', () => {
    const input = [
      { x: 0.1, y: 0.2 },
      { x: 0.32, y: 0.7 },
      { x: 0.8, y: 0.4 },
    ];

    expect(smoothFreehandPoints(input, 0, 1_000, 600)).toEqual(input);
  });

  it('bounds and finite-checks a maximum-sized drawing', () => {
    const input = noisyCircle(8_192);
    const originalFirst = { ...input[0]! };
    const output = smoothFreehandPoints(input, 100, 3_840, 2_160);

    expect(output.length).toBeGreaterThan(0);
    expect(output.length).toBeLessThanOrEqual(512);
    expect(output.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
    expect(output.every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)).toBe(true);
    expect(input[0]).toEqual(originalFirst);
  });

  it('preserves very long zigzags when bounded sampling cannot resolve the smoothing distance', () => {
    const input = Array.from({ length: 8_192 }, (_, index) => ({
      x: index % 2 === 0 ? 0.8 : 0.2,
      y: 0.1 + ((index * 37) % 800) / 1_000,
    }));
    // Dropping thousands of large turns would change the drawing, rather than remove jitter.
    expect(smoothFreehandPoints(input, 100, 3_840, 2_160)).toBe(input);
  });

  it.each([
    { width: 0, height: 100 },
    { width: 100, height: 0 },
  ])('skips a zero-sized surface %j', ({ width, height }) => {
    const input = loop(20, 0.3);
    expect(smoothFreehandPoints(input, 100, width, height)).toBe(input);
  });

  it('preserves short gestures and extremely light smoothing', () => {
    const input = loop(20, 0.3);
    expect(smoothFreehandPoints([], 100, 100, 100)).toEqual([]);
    expect(smoothFreehandPoints(input.slice(0, 3), 100, 100, 100)).toEqual(input.slice(0, 3));
    expect(smoothFreehandPoints(input, 1, 100, 100)).toBe(input);
  });

  it('handles repeated and all-identical points without producing invalid coordinates', () => {
    const repeated = [
      { x: 0.1, y: 0.2 },
      { x: 0.1, y: 0.2 },
      { x: 0.35, y: 0.4 },
      { x: 0.35, y: 0.4 },
      { x: 0.8, y: 0.7 },
      { x: 0.8, y: 0.7 },
    ];
    const identical = Array.from({ length: 64 }, () => ({ x: 0.42, y: 0.64 }));
    const repeatedOutput = smoothFreehandPoints(repeated, 70, 1_000, 400);
    const identicalOutput = smoothFreehandPoints(identical, 70, 1_000, 400);

    for (const output of [repeatedOutput, identicalOutput]) {
      expect(output.length).toBeGreaterThan(0);
      expect(output.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
      expect(output.every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)).toBe(true);
    }
    expect(identicalOutput.every((point) => point.x === 0.42 && point.y === 0.64)).toBe(true);
  });
});
