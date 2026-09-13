import { describe, expect, it, vi } from 'vitest';
import type { ShapeClip } from '~/media/shared/composition-types';
import { createElementText } from '~/media/shared/element-text';
import type { Canvas2DContext } from '~/types/canvas';

const drawingHelpers = vi.hoisted(() => ({
  applyCanvasCaptionFont: vi.fn(),
  drawCaptionText: vi.fn(),
  traceFreehand: vi.fn(),
}));
vi.mock('~/media/shared/caption-font', () => ({
  applyCanvasCaptionFont: drawingHelpers.applyCanvasCaptionFont,
}));
vi.mock('~/media/shared/freehand', () => ({ traceFreehand: drawingHelpers.traceFreehand }));
vi.mock('../captions/render-caption-text', () => ({ drawCaptionText: drawingHelpers.drawCaptionText }));

import { drawElementText, drawFreehand, elementTextCanvas } from './render-element-content';

const shapeClip = (overrides: Partial<ShapeClip> = {}): ShapeClip => ({
  id: 'element',
  trackId: 'elements',
  kind: 'shape',
  name: 'Element',
  assetId: '',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  transform: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
  family: 'text',
  preset: 'text',
  fillColor: '#ff5a1f',
  borderColor: '#ffffff',
  borderWidth: 0,
  cornerRadius: 16,
  arrowThickness: 36,
  arrowHeadSize: 38,
  rotation: 0,
  opacityEnabled: false,
  opacity: 70,
  backdropBlur: 35,
  shadowEnabled: false,
  shadowColor: '#000000',
  shadowBlur: 32,
  shadowDirection: 'bottom-right',
  text: createElementText('Hello'),
  ...overrides,
});

const makeContext = () => ({
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  measureText: vi.fn((text: string) => ({ width: text.length * 12 }) as TextMetrics),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  stroke: vi.fn(),
  lineCap: 'butt' as CanvasLineCap,
  lineJoin: 'miter' as CanvasLineJoin,
  strokeStyle: '',
  lineWidth: 1,
  shadowColor: 'transparent',
});

const asCanvasContext = (ctx: ReturnType<typeof makeContext>) => ctx as unknown as Canvas2DContext;

describe('elementTextCanvas', () => {
  it('scales landscape and portrait viewports to a 1080px short side', () => {
    expect(elementTextCanvas({ width: 1_920, height: 1_080 })).toEqual({ width: 1_920, height: 1_080 });
    expect(elementTextCanvas({ width: 540, height: 1_080 })).toEqual({ width: 1_080, height: 2_160 });
  });

  it('keeps zero-sized viewports finite', () => {
    expect(elementTextCanvas({ width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
  });
});

describe('drawElementText', () => {
  it('skips empty standalone text without touching the canvas or font helpers', () => {
    const ctx = makeContext();
    const clip = shapeClip({ text: createElementText('') });

    drawElementText(asCanvasContext(ctx), clip, { x: 0, y: 0, width: 800, height: 400 });

    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.restore).not.toHaveBeenCalled();
    expect(drawingHelpers.applyCanvasCaptionFont).not.toHaveBeenCalled();
    expect(drawingHelpers.drawCaptionText).not.toHaveBeenCalled();
  });

  it('uses padded, bottom-aligned text layout and rotates around the layer center', () => {
    const ctx = makeContext();
    const text = createElementText('Hi');
    text.padding = 10;
    text.verticalAlign = 'bottom';
    text.style.wrap = false;
    text.style.fontSize = 20;
    text.style.lineHeight = 1.5;
    text.style.textAlign = 'right';
    text.style.textDecoration = 'underline';
    const clip = shapeClip({ text, rotation: 90 });
    const viewport = { x: 30, y: 40, width: 800, height: 400 };

    drawElementText(asCanvasContext(ctx), clip, viewport);

    const canvas = { width: 2_160, height: 1_080 };
    const inset = 64.8;
    const expectedHeight = (20 * 1.5) / canvas.height;
    const expectedTransform = {
      x: clip.transform.x + inset / canvas.width,
      y:
        clip.transform.y +
        inset / canvas.height +
        (clip.transform.height - (2 * inset) / canvas.height) -
        expectedHeight,
      width: clip.transform.width - (2 * inset) / canvas.width,
      height: expectedHeight,
    };

    expect(drawingHelpers.applyCanvasCaptionFont).toHaveBeenCalledWith(ctx, text.style);
    expect(ctx.measureText).not.toHaveBeenCalled();
    expect(ctx.translate).toHaveBeenNthCalledWith(1, 310, 240);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(ctx.translate).toHaveBeenNthCalledWith(2, -310, -240);
    expect(drawingHelpers.drawCaptionText).toHaveBeenCalledOnce();
    const options = drawingHelpers.drawCaptionText.mock.calls[0]![1];
    expect(options).toMatchObject({ text: 'Hi', canvas, viewport });
    expect(options.clip).toMatchObject({
      kind: 'caption',
      transform: expectedTransform,
      caption: { type: 'text', style: { customText: 'Hi', textAlign: 'right', textDecoration: 'underline' } },
    });
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
});

describe('drawFreehand', () => {
  it('skips elements without drawing data', () => {
    const ctx = makeContext();

    drawFreehand(
      asCanvasContext(ctx),
      shapeClip({ drawing: undefined }),
      {
        x: 10,
        y: 20,
        width: 100,
        height: 80,
      },
      1,
    );

    expect(ctx.save).not.toHaveBeenCalled();
    expect(drawingHelpers.traceFreehand).not.toHaveBeenCalled();
  });

  it('rotates around the layer center and strokes a scaled outline before the drawing', () => {
    const ctx = makeContext();
    const drawing = {
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.9, y: 0.8 },
      ],
      smoothing: 65,
      strokeWidth: 8,
    };
    const clip = shapeClip({
      drawing,
      rotation: 45,
      borderWidth: 2,
      borderColor: '#123456',
      fillColor: '#abcdef',
    });
    const rect = { x: 10, y: 20, width: 100, height: 80 };

    drawFreehand(asCanvasContext(ctx), clip, rect, 0.5);

    expect(drawingHelpers.traceFreehand).toHaveBeenCalledWith(ctx, drawing, 100, 80);
    expect(ctx.translate).toHaveBeenNthCalledWith(1, 60, 60);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 4);
    expect(ctx.translate).toHaveBeenNthCalledWith(2, -50, -40);
    expect(ctx.lineCap).toBe('round');
    expect(ctx.lineJoin).toBe('round');
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    expect(ctx.strokeStyle).toBe('#abcdef');
    expect(ctx.lineWidth).toBe(4);
    expect(ctx.shadowColor).toBe('transparent');
    expect(ctx.restore).toHaveBeenCalledOnce();
  });

  it('uses a single scaled stroke when the drawing has no outline', () => {
    const ctx = makeContext();
    const clip = shapeClip({
      drawing: { points: [{ x: 0.5, y: 0.5 }], smoothing: 0, strokeWidth: 10 },
      borderWidth: 0,
    });

    drawFreehand(asCanvasContext(ctx), clip, { x: 0, y: 0, width: 200, height: 100 }, 0.25);

    expect(ctx.stroke).toHaveBeenCalledOnce();
    expect(ctx.lineWidth).toBe(2.5);
    expect(ctx.shadowColor).toBe('transparent');
  });
});
