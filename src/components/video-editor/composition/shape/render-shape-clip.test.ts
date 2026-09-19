import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShapeClip } from '~/media/shared/composition-types';
import { createElementText } from '~/media/shared/element-text';
const blurEffect = vi.hoisted(() => ({ applyBlurEffect: vi.fn() }));
const elementContent = vi.hoisted(() => ({ drawElementText: vi.fn(), drawFreehand: vi.fn() }));
vi.mock('../effects/blur-effect', () => blurEffect);
vi.mock('./render-element-content', () => elementContent);
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

const context = () => {
  const gradient = { addColorStop: vi.fn() };
  return {
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
    createLinearGradient: vi.fn(() => gradient),
    createRadialGradient: vi.fn(() => gradient),
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    gradient,
  } as unknown as CanvasRenderingContext2D & {
    createLinearGradient: ReturnType<typeof vi.fn>;
    createRadialGradient: ReturnType<typeof vi.fn>;
    gradient: typeof gradient;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'Path2D',
    class Path2DMock {
      readonly data?: string;
      readonly additions: Array<{ path: Path2DMock; transform: unknown }> = [];

      constructor(data?: string) {
        this.data = data;
      }

      addPath(path: Path2DMock, transform: unknown) {
        this.additions.push({ path, transform });
      }
    },
  );
  vi.stubGlobal(
    'DOMMatrix',
    class DOMMatrixMock {
      translateSelf() {
        return this;
      }

      rotateSelf() {
        return this;
      }

      scaleSelf() {
        return this;
      }
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

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

  it('renders catalog SVG paths as scalable canvas vectors', () => {
    const ctx = context();

    drawShapeClip(ctx, shapeClip({ preset: 'heart', borderWidth: 5 }), {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });

    const transformed = expect.objectContaining({
      additions: [
        expect.objectContaining({ path: expect.objectContaining({ data: expect.stringMatching(/^M50 92/) }) }),
      ],
    });
    expect(ctx.fill).toHaveBeenCalledWith(transformed, 'nonzero');
    expect(ctx.stroke).toHaveBeenCalledWith(transformed);
    expect(ctx.lineWidth).toBeCloseTo(5 * (100 / 1_080));
  });

  it('fills a shape with its gradient stops and alpha values', () => {
    const ctx = context();
    const gradient = {
      type: 'linear' as const,
      angle: 90,
      stops: [
        { id: 'start', position: 0, color: '#112233', alpha: 0.5 },
        { id: 'end', position: 1, color: '#aabbcc', alpha: 1 },
      ],
    };

    drawShapeClip(ctx, shapeClip({ fill: { kind: 'gradient', gradient } }), {
      x: 10,
      y: 20,
      width: 200,
      height: 100,
    });

    expect(ctx.createLinearGradient).toHaveBeenCalledWith(30, 60, 130, 60);
    expect(ctx.gradient.addColorStop).toHaveBeenNthCalledWith(1, 0, '#11223380');
    expect(ctx.gradient.addColorStop).toHaveBeenNthCalledWith(2, 1, '#aabbccff');
    expect(ctx.fillStyle).toBe(ctx.gradient);
    expect(ctx.fill).toHaveBeenCalledOnce();
  });

  it('keeps the legacy fillColor when no fill value is present', () => {
    const ctx = context();

    drawShapeClip(ctx, shapeClip({ fillColor: '#123abc' }), { x: 0, y: 0, width: 800, height: 400 });

    expect(ctx.fillStyle).toBe('#123abc');
    expect(ctx.createLinearGradient).not.toHaveBeenCalled();
    expect(ctx.createRadialGradient).not.toHaveBeenCalled();
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
    const ctx = context();
    const backdrop = {} as CanvasImageSource;
    const clip = shapeClip({
      family: 'arrow',
      preset: 'arrow',
      rotation: 90,
      opacityEnabled: true,
      backdropBlur: 64,
    });
    const viewport = { x: 10, y: 20, width: 800, height: 400 };

    drawShapeClip(ctx, clip, viewport, clip.transform, backdrop);

    expect(blurEffect.applyBlurEffect).toHaveBeenCalledOnce();
    const [, blurClip, rect, options] = blurEffect.applyBlurEffect.mock.calls[0]!;
    expect(blurClip).toMatchObject({ kind: 'blur', mode: 'blur', strength: 64, shape: 'rectangle' });
    expect(rect).toEqual({ x: 90, y: 100, width: 400, height: 160 });
    expect(options.bounds.x).toBeCloseTo(210);
    expect(options.bounds.y).toBeCloseTo(-20);
    expect(options.bounds.width).toBeCloseTo(160);
    expect(options.bounds.height).toBeCloseTo(400);
    expect(options.maskPath).toEqual(expect.any(Function));
    expect(options.source).toBe(backdrop);

    const maskContext = context();
    options.maskPath(maskContext, rect);
    expect(maskContext.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(maskContext.scale).toHaveBeenCalledWith(400, 160);
    expect(maskContext.moveTo).toHaveBeenCalled();
  });

  it('draws integrated text after the vector shape and passes the selected transform', () => {
    const ctx = context();
    const clip = shapeClip({
      text: createElementText('Label'),
      borderWidth: 4,
      shadowEnabled: true,
      shadowColor: '#456789',
    });
    const viewport = { x: 10, y: 20, width: 200, height: 100 };
    const transform = { x: 0.2, y: 0.3, width: 0.4, height: 0.2 };

    drawShapeClip(ctx, clip, viewport, transform);

    expect(ctx.fill).toHaveBeenCalledOnce();
    expect(ctx.stroke).toHaveBeenCalledOnce();
    expect(vi.mocked(ctx.fill).mock.invocationCallOrder[0]).toBeLessThan(
      elementContent.drawElementText.mock.invocationCallOrder[0]!,
    );
    expect(elementContent.drawElementText).toHaveBeenCalledWith(ctx, { ...clip, transform }, viewport);
    expect(ctx.shadowColor).toBe('transparent');
  });

  it('renders a standalone text element without a shape fill or backdrop blur', () => {
    const ctx = context();
    const clip = shapeClip({
      family: 'text',
      preset: 'text',
      text: createElementText('Standalone'),
      rotation: 35,
      opacityEnabled: true,
      opacity: 25,
      backdropBlur: 80,
    });
    const viewport = { x: 0, y: 0, width: 1_920, height: 1_080 };

    drawShapeClip(ctx, clip, viewport);

    expect(ctx.globalAlpha).toBe(0.25);
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(blurEffect.applyBlurEffect).not.toHaveBeenCalled();
    expect(elementContent.drawElementText).toHaveBeenCalledWith(ctx, clip, viewport);
  });

  it('routes freehand layers through the shared drawing renderer while retaining layer opacity', () => {
    const ctx = context();
    const drawing = {
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.9, y: 0.8 },
      ],
      smoothing: 65,
      strokeWidth: 12,
    };
    const clip = shapeClip({
      family: 'drawing',
      preset: 'freehand',
      drawing,
      opacityEnabled: true,
      opacity: 60,
      backdropBlur: 90,
    });
    const viewport = { x: 10, y: 20, width: 800, height: 400 };

    drawShapeClip(ctx, clip, viewport);

    expect(ctx.globalAlpha).toBe(0.6);
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(blurEffect.applyBlurEffect).not.toHaveBeenCalled();
    expect(elementContent.drawFreehand).toHaveBeenCalledWith(
      ctx,
      clip,
      { x: 90, y: 100, width: 400, height: 160 },
      400 / 1_080,
    );
    expect(elementContent.drawElementText).toHaveBeenCalledWith(ctx, clip, viewport);
  });

  it('ignores a layer whose transform has no drawable area', () => {
    const ctx = context();
    const clip = shapeClip({ transform: { x: 0.1, y: 0.2, width: 0, height: 0.4 } });

    drawShapeClip(ctx, clip, { x: 0, y: 0, width: 800, height: 400 });

    expect(ctx.save).not.toHaveBeenCalled();
    expect(elementContent.drawElementText).not.toHaveBeenCalled();
    expect(elementContent.drawFreehand).not.toHaveBeenCalled();
  });
});
