import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BlurClip } from '~/media/shared/composition-types';
import type { Canvas2DContext } from '~/types/canvas';
import { applyBlurEffect, effectShapeRect } from './blur-effect';

const blurClip = (overrides: Partial<BlurClip> = {}): BlurClip => ({
  id: 'blur',
  kind: 'blur',
  assetId: '',
  name: 'Blur',
  timelineStartMs: 0,
  timelineDurationMs: 5_000,
  sourceInMs: 0,
  sourceDurationMs: 5_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0.2, y: 0.2, width: 0.3, height: 0.2 },
  shape: 'rectangle',
  mode: 'blur',
  strength: 60,
  feather: 0,
  cornerRadius: 0,
  tintOpacity: 0,
  color: '#000000',
  ...overrides,
});

class FakeContext {
  canvas: { width: number; height: number };
  filter = 'none';
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
  imageSmoothingEnabled = true;
  drawImage = vi.fn();
  setTransform = vi.fn();
  clearRect = vi.fn();
  save = vi.fn();
  restore = vi.fn();
  beginPath = vi.fn();
  arc = vi.fn();
  rect = vi.fn();
  roundRect = vi.fn();
  fill = vi.fn();
  fillRect = vi.fn();

  constructor(canvas: { width: number; height: number }) {
    this.canvas = canvas;
  }

  getTransform() {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('blur effect renderer', () => {
  it('centers square and circular effects inside rectangular transforms', () => {
    const rect = { x: 10, y: 20, width: 100, height: 60 };
    expect(effectShapeRect('rectangle', rect)).toEqual(rect);
    expect(effectShapeRect('square', rect)).toEqual({ x: 30, y: 20, width: 60, height: 60 });
    expect(effectShapeRect('circle', rect)).toEqual({ x: 30, y: 20, width: 60, height: 60 });
  });

  it('uses the configured corner radius for rectangular and square masks', () => {
    const surfaces: FakeContext[] = [];
    class FakeOffscreenCanvas {
      width: number;
      height: number;
      private readonly context: FakeContext;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.context = new FakeContext(this);
        surfaces.push(this.context);
      }

      getContext() {
        return this.context;
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    const output = new FakeContext({ width: 800, height: 450 }) as unknown as Canvas2DContext;
    applyBlurEffect(output, blurClip({ cornerRadius: 50 }), { x: 100, y: 100, width: 200, height: 100 });

    const mask = surfaces[2];
    expect(mask.roundRect).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 200, 100, 25);
    expect(mask.rect).not.toHaveBeenCalled();

    mask.roundRect.mockClear();
    applyBlurEffect(output, blurClip({ shape: 'circle', cornerRadius: 100 }), {
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
    expect(mask.arc).toHaveBeenCalled();
    expect(mask.roundRect).not.toHaveBeenCalled();
  });

  it('reuses region-sized scratch surfaces between frames and modes', () => {
    const surfaces: Array<{ width: number; height: number }> = [];
    const contexts: FakeContext[] = [];
    class FakeOffscreenCanvas {
      width: number;
      height: number;
      private readonly context: FakeContext;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.context = new FakeContext(this);
        surfaces.push(this);
        contexts.push(this.context);
      }

      getContext() {
        return this.context;
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    const outputCanvas = { width: 1_920, height: 1_080 };
    const output = new FakeContext(outputCanvas) as unknown as Canvas2DContext;
    const rect = { x: 100, y: 120, width: 300, height: 180 };

    applyBlurEffect(output, blurClip({ mode: 'frosted', feather: 20, tintOpacity: 25 }), rect);
    expect(surfaces).toHaveLength(4);
    expect(surfaces.slice(0, 3).every((surface) => surface.width < outputCanvas.width)).toBe(true);
    expect(contexts[1].fillRect).toHaveBeenCalled();

    contexts[1].fillRect.mockClear();
    applyBlurEffect(output, blurClip({ mode: 'pixelated', strength: 90, tintOpacity: 100 }), rect);
    expect(contexts[1].fillRect).not.toHaveBeenCalled();
    applyBlurEffect(output, blurClip({ mode: 'opaque', color: '#112233' }), rect);
    expect(contexts[1].fillRect).toHaveBeenCalled();
    expect(surfaces).toHaveLength(4);
    expect(output.drawImage).toHaveBeenCalledTimes(3);
  });

  it('uses a custom mask path independently from expanded effect bounds', () => {
    class FakeOffscreenCanvas {
      width: number;
      height: number;
      private readonly context: FakeContext;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.context = new FakeContext(this);
      }

      getContext() {
        return this.context;
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    const output = new FakeContext({ width: 800, height: 450 }) as unknown as Canvas2DContext;
    const maskPath = vi.fn((context: Canvas2DContext, _rect: { x: number; y: number; width: number; height: number }) =>
      context.beginPath(),
    );

    applyBlurEffect(output, blurClip(), { x: 200, y: 150, width: 120, height: 60 }, {
      bounds: { x: 180, y: 120, width: 160, height: 120 },
      maskPath,
    });

    expect(maskPath).toHaveBeenCalledOnce();
    expect(maskPath.mock.calls[0]![1]).toMatchObject({ width: 120, height: 60 });
  });
});
