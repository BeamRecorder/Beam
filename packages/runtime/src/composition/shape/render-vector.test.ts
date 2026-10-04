import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vectorPaintPaths, drawVector } from './render-vector';
import { drawShapeClip } from './render-shape-clip';
import { arrowVector } from '@beam/engine/shared/shape-vector-presets';
import { vectorFromSvg } from '@beam/engine/shared/shape-vector-svg';
import { shapePaintStyle } from './shape-paint-style';
import { gpuShapePlan } from './gpu-shape-plan';
import { shape } from './tests/gpu-shape.fixtures';
import type { Canvas2DContext } from '../../canvas-types';
const blur = vi.hoisted(() => ({ applyBlurEffect: vi.fn() }));
vi.mock('../effects/blur-effect', () => blur);
class TestPath {
  data: string;
  constructor(data = '') {
    this.data = data;
  }
  addPath(path: TestPath, matrix: TestMatrix) {
    this.data += `${path.data}|${matrix.operations.join(';')}`;
  }
}
class TestMatrix {
  operations: string[] = [];
  translateSelf(x: number, y: number) {
    this.operations.push(`translate(${x},${y})`);
    return this;
  }
  rotateSelf(degrees: number) {
    this.operations.push(`rotate(${degrees})`);
    return this;
  }
}
const rect = { x: 100, y: 200, width: 300, height: 140 };
const context = () => {
  const strokes: { width: number; color: unknown; path: TestPath; cap: string }[] = [];
  const fills: { color: unknown; rule: unknown; path: TestPath }[] = [];
  const ctx = {
    canvas: { width: 1920, height: 1080 },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowColor: 'black',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: '',
    lineJoin: '',
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    fill: vi.fn((path: TestPath, rule: unknown) => fills.push({ path, rule, color: ctx.fillStyle })),
    stroke: vi.fn((path: TestPath) =>
      strokes.push({ path, color: ctx.strokeStyle, width: ctx.lineWidth, cap: ctx.lineCap }),
    ),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
  return { ctx: ctx as unknown as Canvas2DContext, strokes, fills };
};
beforeEach(() => {
  vi.stubGlobal('Path2D', TestPath);
  vi.stubGlobal('DOMMatrix', TestMatrix);
  blur.applyBlurEffect.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
describe('vector painter shared by preview and export', () => {
  it('retains paths across frames and invalidates geometry, transform and scale', () => {
    const clip = shape({ vector: arrowVector('curved'), rotation: 30 });
    const first = vectorPaintPaths(clip, rect, clip, 1);
    expect(vectorPaintPaths(clip, rect, clip, 1)).toBe(first);
    expect((first.open as unknown as TestPath).data).toContain('rotate(30)');
    expect(vectorPaintPaths(clip, { ...rect, width: 350 }, clip, 1)).not.toBe(first);
    expect(vectorPaintPaths(clip, rect, clip, 0.5)).not.toBe(first);
    clip.vector = arrowVector('line');
    expect(vectorPaintPaths(clip, rect, clip, 1).vector).toBe(clip.vector);
  });
  it('paints closed paths with fill rules and canonical border width', () => {
    const clip = shape({
      vector: vectorFromSvg('M0 0L1 0L1 1Z', 1, 1, 'evenodd'),
      fillEnabled: true,
      fillColor: '#123456',
      borderWidth: 4,
    });
    const { ctx, fills, strokes } = context();
    drawVector(ctx, clip, rect, clip, 0.5);
    expect(fills[0]).toMatchObject({ color: '#123456', rule: 'evenodd' });
    expect(strokes[0]).toMatchObject({ color: clip.borderColor, width: 2 });
    expect(ctx.shadowColor).toBe('transparent');
    expect(ctx.lineCap).toBe('round');
  });
  it('paints open arrows with outline, gradient and markers without nonuniform stroke scaling', () => {
    const clip = shape({
      vector: arrowVector('double'),
      fillEnabled: true,
      borderWidth: 2,
      fill: {
        kind: 'gradient',
        gradient: {
          type: 'linear',
          angle: 90,
          stops: [
            { id: 'a', alpha: 1, color: '#112233', position: 0 },
            { id: 'b', alpha: 1, color: '#445566', position: 1 },
          ],
        },
      },
    });
    const { ctx, strokes, fills } = context();
    drawVector(ctx, clip, rect, clip, 2);
    expect(strokes[2]!.width).toBe(24);
    expect(strokes[4]!.width).toBe(16);
    expect(strokes[2]!.cap).toBe('butt');
    expect(strokes[4]!.cap).toBe('butt');
    expect(ctx.createLinearGradient).toHaveBeenCalled();
    expect(fills.at(-1)!.path.data).toContain('Z');
  });
  it('retains round caps on ordinary drawing strokes while preventing oversized shafts from protruding past tips', () => {
    const vector = vectorFromSvg('M0 .5L1 .5');
    const plain = shape({ vector, fillEnabled: true, borderWidth: 0 });
    const drawing = context();
    drawVector(drawing.ctx, plain, rect, plain, 1);
    expect(drawing.strokes[0]!.cap).toBe('round');
    const arrow = shape({
      vector: { ...vector, endMarker: 'triangle', strokeWidth: 120, markerSize: 1 },
      fillEnabled: true,
      borderWidth: 0,
    });
    const marked = context();
    drawVector(marked.ctx, arrow, rect, arrow, 1);
    expect(marked.strokes[0]!.cap).toBe('butt');
    const path = marked.strokes[0]!.path.data.split('|')[0]!;
    expect(vectorFromSvg(path, rect.width, rect.height).contours[0]!.nodes.at(-1)!.x).toBeLessThan(1);
    expect(marked.ctx.lineCap).toBe('round');
  });
  it('keeps outlines visible with fill disabled and excludes empty paint with no outline', () => {
    const clip = shape({ vector: arrowVector('solid'), fillEnabled: false, borderWidth: 6 });
    const { ctx, strokes, fills } = context();
    drawVector(ctx, clip, rect, clip, 1);
    expect(fills).toHaveLength(0);
    expect(strokes).toHaveLength(4);
    clip.borderWidth = 0;
    const empty = context();
    drawVector(empty.ctx, clip, rect, clip, 1);
    expect(empty.ctx.fill).not.toHaveBeenCalled();
    expect(empty.ctx.stroke).not.toHaveBeenCalled();
  });
  it('uses vector geometry for backdrop masks and invalidates mutable still-editor paints', () => {
    const clip = shape({ vector: vectorFromSvg('M0 0L1 0L1 1Z'), opacityEnabled: true, opacity: 50, backdropBlur: 20 });
    const { ctx } = context();
    const style = shapePaintStyle(clip);
    drawShapeClip(ctx, clip, { x: 0, y: 0, width: 1920, height: 1080 });
    const options = blur.applyBlurEffect.mock.calls[0]![3];
    options.maskPath(ctx, rect);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.globalAlpha).toBe(0.5);
    clip.vector = arrowVector('line');
    expect(shapePaintStyle(clip)).not.toBe(style);
  });
  it('does not batch an edited rectangle as a solid GPU rectangle', () => {
    const clip = shape({ preset: 'rectangle', vector: vectorFromSvg('M0 0L1 0L1 1Z') });
    const { ctx } = context();
    expect(gpuShapePlan(ctx, clip, { x: 0, y: 0, width: 1920, height: 1080 })).toBeNull();
  });
});
