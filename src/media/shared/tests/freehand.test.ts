import { describe, expect, it, vi } from 'vitest';
import type { Canvas2DContext } from '~/types/canvas';
import type { DrawingPoint, FreehandDrawing } from '../element-types';
import {
  DEFAULT_DRAWING_SETTINGS,
  finishDrawing,
  isFreehandDrawing,
  MAX_DRAWING_POINTS,
  traceFreehand,
} from '../freehand';

const drawing = (overrides: Partial<FreehandDrawing> = {}): FreehandDrawing => ({
  points: [
    { x: 0.2, y: 0.3 },
    { x: 0.8, y: 0.7 },
  ],
  smoothing: 65,
  strokeWidth: 8,
  ...overrides,
});

const drawingContext = () => ({
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  bezierCurveTo: vi.fn(),
});

describe('freehand drawing validation', () => {
  it('accepts normalized points and the inclusive setting boundaries', () => {
    expect(
      isFreehandDrawing(
        drawing({
          points: [
            { x: 0, y: 1 },
            { x: 1, y: 0 },
          ],
          smoothing: 0,
          strokeWidth: 1,
        }),
      ),
    ).toBe(true);
    expect(isFreehandDrawing(drawing({ smoothing: 100, strokeWidth: 120 }))).toBe(true);
    expect(DEFAULT_DRAWING_SETTINGS).toEqual({
      smoothing: 65,
      strokeWidth: 8,
      color: '#ff5a1f',
    });
  });

  it.each([
    ['missing drawing', undefined],
    ['null drawing', null],
    ['non-array points', { ...drawing(), points: null as unknown as DrawingPoint[] }],
    ['no points', drawing({ points: [] })],
    [
      'too many points',
      drawing({
        points: Array.from({ length: MAX_DRAWING_POINTS + 1 }, () => ({
          x: 0.5,
          y: 0.5,
        })),
      }),
    ],
    ['null point', drawing({ points: [null as unknown as DrawingPoint] })],
    ['non-finite x', drawing({ points: [{ x: Number.NaN, y: 0.5 }] })],
    ['non-finite y', drawing({ points: [{ x: 0.5, y: Number.POSITIVE_INFINITY }] })],
    ['point below the canvas', drawing({ points: [{ x: -Number.EPSILON, y: 0.5 }] })],
    ['point beyond the canvas', drawing({ points: [{ x: 0.5, y: 1 + Number.EPSILON }] })],
    ['smoothing below range', drawing({ smoothing: -1 })],
    ['non-finite smoothing', drawing({ smoothing: Number.NaN })],
    ['smoothing above range', drawing({ smoothing: 101 })],
    ['stroke width below range', drawing({ strokeWidth: 0 })],
    ['non-finite stroke width', drawing({ strokeWidth: Number.POSITIVE_INFINITY })],
    ['stroke width above range', drawing({ strokeWidth: 121 })],
  ])('rejects %s', (_label, value) => {
    expect(isFreehandDrawing(value as FreehandDrawing)).toBe(false);
  });
});

describe('finishDrawing', () => {
  const settings = { smoothing: 42, strokeWidth: 8, color: '#123456' };
  const canvas = { width: 1920, height: 1080 };

  it('returns no element for empty input, unusable canvas dimensions, or no finite points', () => {
    expect(finishDrawing([], settings, canvas)).toBeNull();
    expect(finishDrawing([{ x: 0.5, y: 0.5 }], settings, { width: 0, height: 1080 })).toBeNull();
    expect(
      finishDrawing([{ x: 0.5, y: 0.5 }], settings, {
        width: 1920,
        height: -1,
      }),
    ).toBeNull();
    expect(
      finishDrawing(
        [
          { x: Number.NaN, y: 0.2 },
          { x: 0.4, y: Number.NEGATIVE_INFINITY },
        ],
        settings,
        canvas,
      ),
    ).toBeNull();
  });

  it('adds stroke padding and stores the path relative to its normalized transform', () => {
    const result = finishDrawing(
      [
        { x: 0.25, y: 0.2 },
        { x: 0.75, y: 0.8 },
      ],
      settings,
      canvas,
    );
    expect(result).not.toBeNull();

    const padX = 4 / canvas.width;
    const padY = 4 / canvas.height;
    const expectedWidth = 0.5 + 2 * padX;
    const expectedHeight = 0.6 + 2 * padY;
    expect(result!.transform.x).toBeCloseTo(0.25 - padX);
    expect(result!.transform.y).toBeCloseTo(0.2 - padY);
    expect(result!.transform.width).toBeCloseTo(expectedWidth);
    expect(result!.transform.height).toBeCloseTo(expectedHeight);
    expect(result!.drawing).toMatchObject({
      smoothing: settings.smoothing,
      strokeWidth: settings.strokeWidth,
    });
    expect(result!.drawing.points[0]!.x).toBeCloseTo(padX / expectedWidth);
    expect(result!.drawing.points[0]!.y).toBeCloseTo(padY / expectedHeight);
    expect(result!.drawing.points[1]!.x).toBeCloseTo(1 - padX / expectedWidth);
    expect(result!.drawing.points[1]!.y).toBeCloseTo(1 - padY / expectedHeight);
    expect(isFreehandDrawing(result!.drawing)).toBe(true);
  });

  it('filters non-finite samples and keeps a one-point mark visible at the minimum pixel size', () => {
    const result = finishDrawing(
      [
        { x: Number.NaN, y: 0.3 },
        { x: 0.4, y: 0.6 },
        { x: 0.4, y: Number.POSITIVE_INFINITY },
      ],
      { ...settings, strokeWidth: 1 },
      canvas,
    );
    expect(result).not.toBeNull();
    expect(result!.drawing.points[0]!.x).toBeCloseTo(0.5);
    expect(result!.drawing.points[0]!.y).toBeCloseTo(0.5);
    expect(result!.transform.width).toBeCloseTo(1 / canvas.width);
    expect(result!.transform.height).toBeCloseTo(1 / canvas.height);
  });

  it('caps a persisted path at the maximum number of samples', () => {
    const points = Array.from({ length: MAX_DRAWING_POINTS + 1 }, (_, index) => ({
      x: (index % 100) / 99,
      y: (index % 80) / 79,
    }));
    const result = finishDrawing(points, settings, canvas);

    expect(result?.drawing.points).toHaveLength(MAX_DRAWING_POINTS);
    const last = result!.drawing.points.at(-1)!;
    const pointBeforeLimit = points[MAX_DRAWING_POINTS - 1]!;
    const pointPastLimit = points[MAX_DRAWING_POINTS]!;
    expect(result!.transform.x + last.x * result!.transform.width).toBeCloseTo(pointBeforeLimit.x);
    expect(result!.transform.y + last.y * result!.transform.height).toBeCloseTo(pointBeforeLimit.y);
    expect(result!.transform.x + last.x * result!.transform.width).not.toBeCloseTo(pointPastLimit.x);
  });
});

describe('traceFreehand', () => {
  it('does nothing for an empty path', () => {
    const ctx = drawingContext();
    traceFreehand(ctx as unknown as Canvas2DContext, drawing({ points: [] }), 200, 100);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('turns a single point into a nonzero path segment', () => {
    const ctx = drawingContext();
    traceFreehand(ctx as unknown as Canvas2DContext, drawing({ points: [{ x: 0.25, y: 0.75 }] }), 400, 200);

    expect(ctx.beginPath).toHaveBeenCalledOnce();
    expect(ctx.moveTo).toHaveBeenCalledWith(100, 150);
    expect(ctx.lineTo).toHaveBeenCalledWith(100.01, 150);
    expect(ctx.bezierCurveTo).not.toHaveBeenCalled();
  });

  it('uses straight segments when smoothing is disabled', () => {
    const ctx = drawingContext();
    traceFreehand(
      ctx as unknown as Canvas2DContext,
      drawing({
        smoothing: 0,
        points: [
          { x: 0, y: 0.5 },
          { x: 0.5, y: 0.25 },
          { x: 1, y: 1 },
        ],
      }),
      200,
      100,
    );

    expect(ctx.moveTo).toHaveBeenCalledWith(0, 50);
    expect(ctx.lineTo.mock.calls).toEqual([
      [100, 25],
      [200, 100],
    ]);
    expect(ctx.bezierCurveTo).not.toHaveBeenCalled();
  });

  it('uses scaled Catmull–Rom curves and clamps control points to the rectangle', () => {
    const ctx = drawingContext();
    traceFreehand(
      ctx as unknown as Canvas2DContext,
      drawing({
        smoothing: 100,
        points: [
          { x: -1, y: 0 },
          { x: 1, y: 1 },
          { x: -1, y: 0 },
        ],
      }),
      200,
      100,
    );

    expect(ctx.bezierCurveTo).toHaveBeenCalledTimes(2);
    for (const [x1, y1, x2, y2, x, y] of ctx.bezierCurveTo.mock.calls) {
      expect(x1).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(200);
      expect(x2).toBeGreaterThanOrEqual(0);
      expect(x2).toBeLessThanOrEqual(200);
      expect(y1).toBeGreaterThanOrEqual(0);
      expect(y1).toBeLessThanOrEqual(100);
      expect(y2).toBeGreaterThanOrEqual(0);
      expect(y2).toBeLessThanOrEqual(100);
      expect(x).toBeLessThanOrEqual(200);
      expect(y).toBeLessThanOrEqual(100);
    }
  });
});
