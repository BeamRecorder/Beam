import { describe, expect, it, vi } from 'vitest';
import type { ShapeClip } from '~/media/shared/composition-types';
const blurEffect = vi.hoisted(() => ({ applyBlurEffect: vi.fn() }));
vi.mock('../effects/blur-effect', () => blurEffect);
import { drawShapeClip } from './render-shape-clip';

const shapeClip = (overrides: Partial<ShapeClip> = {}): ShapeClip => ({
  id: 'shape',
  trackId: 'shape-track',
  kind: 'shape',
  name: 'Shape',
  assetId: '',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  transform: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  family: 'shape',
  preset: 'rounded-rectangle',
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
  ...overrides,
});

const context = () =>
  ({
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    ellipse: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    closePath: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  }) as unknown as CanvasRenderingContext2D;

describe('drawShapeClip', () => {
  it('uses the optional opacity toggle without applying a canvas filter', () => {
    const disabled = context();
    drawShapeClip(disabled, shapeClip({ opacityEnabled: false, opacity: 42 }), {
      x: 0,
      y: 0,
      width: 1_920,
      height: 1_080,
    });
    expect(disabled.globalAlpha).toBe(1);

    const enabled = context();
    drawShapeClip(enabled, shapeClip({ opacityEnabled: true, opacity: 42 }), {
      x: 0,
      y: 0,
      width: 1_920,
      height: 1_080,
    });
    expect(enabled.globalAlpha).toBe(0.42);
    expect('filter' in enabled).toBe(false);
  });

  it('draws a vector preset inside its transformed viewport bounds', () => {
    const ctx = context();

    drawShapeClip(ctx, shapeClip(), { x: 10, y: 20, width: 200, height: 100 });

    expect(ctx.translate).toHaveBeenNthCalledWith(1, 80, 60);
    expect(ctx.translate).toHaveBeenNthCalledWith(2, -50, -20);
    expect(ctx.scale).toHaveBeenCalledWith(100, 40);
    expect(ctx.roundRect).toHaveBeenCalledWith(0, 0, 1, 1, 0.16);
    expect(ctx.fillStyle).toBe('#ff5a1f');
    expect(ctx.fill).toHaveBeenCalledOnce();
    expect(ctx.save).toHaveBeenCalledTimes(2);
    expect(ctx.restore).toHaveBeenCalledTimes(2);
  });

  it('applies opacity, border, rotation, and directional shadow', () => {
    const ctx = context();

    drawShapeClip(
      ctx,
      shapeClip({
        family: 'arrow',
        preset: 'arrow',
        rotation: 270,
        opacityEnabled: true,
        opacity: 42,
        borderWidth: 8,
        borderColor: '#123456',
        shadowEnabled: true,
        shadowColor: '#654321',
        shadowBlur: 48,
        shadowDirection: 'top-left',
      }),
      { x: 0, y: 0, width: 1_920, height: 1_080 },
    );

    expect(ctx.globalAlpha).toBe(0.42);
    expect(ctx.shadowColor).toBe('transparent');
    expect(ctx.shadowBlur).toBe(48);
    expect(ctx.shadowOffsetX).toBe(-12);
    expect(ctx.shadowOffsetY).toBe(-12);
    expect(ctx.rotate).toHaveBeenCalledWith((270 * Math.PI) / 180);
    expect(ctx.strokeStyle).toBe('#123456');
    expect(ctx.lineWidth).toBe(8);
    expect(ctx.stroke).toHaveBeenCalledOnce();
    expect(ctx.restore).toHaveBeenCalledTimes(2);
  });

  it('passes a rotated shape mask and bounds to the backdrop blur renderer', () => {
    blurEffect.applyBlurEffect.mockClear();
    const ctx = context();
    const clip = shapeClip({
      family: 'arrow',
      preset: 'arrow',
      rotation: 90,
      opacityEnabled: true,
      backdropBlur: 64,
    });
    const viewport = { x: 10, y: 20, width: 800, height: 400 };

    drawShapeClip(ctx, clip, viewport);

    expect(blurEffect.applyBlurEffect).toHaveBeenCalledOnce();
    const [, blurClip, rect, options] = blurEffect.applyBlurEffect.mock.calls[0]!;
    expect(blurClip).toMatchObject({ kind: 'blur', mode: 'blur', strength: 64, shape: 'rectangle' });
    expect(rect).toEqual({ x: 90, y: 100, width: 400, height: 160 });
    expect(options.bounds).toEqual({ x: 210, y: -20, width: 160, height: 400 });
    expect(options.maskPath).toEqual(expect.any(Function));

    const maskContext = context();
    options.maskPath(maskContext, rect);
    expect(maskContext.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(maskContext.scale).toHaveBeenCalledWith(400, 160);
    expect(maskContext.moveTo).toHaveBeenCalled();
  });
});
