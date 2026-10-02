import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
class Bitmap {
  readonly rgba: number[];
  constructor(rgba = [240, 30, 80, 255]) {
    this.rgba = rgba;
  }
}
const bitmap = (rgba?: number[]) => new Bitmap(rgba) as unknown as ImageBitmap;
let contexts: ReturnType<typeof makeContext>[];
const makeContext = () => {
  const draws: unknown[][] = [];
  return {
    clearRect: vi.fn(() => draws.splice(0)),
    drawImage: vi.fn((...args: unknown[]) => draws.push(args)),
    getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (const args of draws) {
        const source = args[0] as Bitmap,
          x = args.length === 5 ? Number(args[1]) : Number(args[5]);
        for (let row = 0; row < height; row++)
          for (let col = x; col < x + 8; col++) data.set(source.rgba, (row * width + col) * 4);
      }
      return { data };
    }),
  };
};
class Canvas {
  width: number;
  height: number;
  ctx = makeContext();
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    contexts.push(this.ctx);
  }
  getContext() {
    return this.ctx;
  }
}
beforeEach(async () => {
  vi.resetModules();
  contexts = [];
  vi.stubGlobal('ImageBitmap', Bitmap);
  vi.stubGlobal('VideoFrame', undefined);
  vi.stubGlobal('OffscreenCanvas', Canvas);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const load = () => import('./adaptive-shadow');

describe('adaptive shadow color', () => {
  it('weights chromatic nontransparent pixels and handles gray/light colors', async () => {
    const { shadowColorFromPixels: color } = await load();
    expect(color(new Uint8ClampedArray([255, 0, 0, 255]))).toMatch(/^hsla\(0,/);
    expect(color(new Uint8ClampedArray([0, 255, 0, 255]))).toMatch(/^hsla\(120,/);
    expect(color(new Uint8ClampedArray([0, 0, 255, 255]))).toMatch(/^hsla\(240,/);
    expect(color(new Uint8ClampedArray([255, 0, 255, 255]))).toMatch(/^hsla\(300,/);
    expect(color(new Uint8ClampedArray([220, 220, 220, 255]))).toMatch(/^hsla\(210,/);
    expect(color(new Uint8ClampedArray([255, 180, 180, 255]))).toMatch(/^hsla\(0,/);
  });
  it('retains the selected color for empty or transparent samples', async () => {
    const { shadowColorFromPixels: color } = await load();
    expect(color(new Uint8ClampedArray())).toBe('#000000');
    expect(color(new Uint8ClampedArray([255, 0, 0, 10]), '#abcdef')).toBe('#abcdef');
    expect(color(new Uint8ClampedArray([0, 0, 0, 0]), '')).toBe('#000000');
  });
  it('reads one immutable frame once while keeping crops and selected colors independent', async () => {
    const { adaptiveShadowColor: color } = await load(),
      source = bitmap(),
      rect = { x: 1, y: 2, width: 50, height: 20 };
    const first = color(source, rect);
    expect(color(source, { ...rect })).toBe(first);
    color(source);
    color(source, rect, '#abcdef');
    expect(contexts[0]!.getImageData).toHaveBeenCalledTimes(3);
    expect(contexts[0]!.drawImage).toHaveBeenCalledWith(source, 1, 2, 50, 20, 0, 0, 8, 8);
  });
  it('does not freeze changing mutable sources or replace colors across frames', async () => {
    const { adaptiveShadowColor: color } = await load();
    const mutable = { rgba: [255, 0, 0, 255] } as unknown as CanvasImageSource;
    const red = color(mutable);
    (mutable as unknown as Bitmap).rgba[0] = 0;
    (mutable as unknown as Bitmap).rgba[1] = 255;
    expect(color(mutable)).not.toBe(red);
    expect(color(bitmap([0, 0, 255, 255]))).not.toBe(red);
    expect(contexts[0]!.getImageData).toHaveBeenCalledTimes(3);
  });
  it('uses document sampling when offscreen canvases are unavailable', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    vi.spyOn(document, 'createElement').mockReturnValue(new Canvas(8, 8) as unknown as HTMLCanvasElement);
    const { adaptiveShadowColor: color } = await load();
    expect(color(bitmap())).toMatch(/^hsla/);
  });
  it('handles missing runtimes, missing contexts and creation failure without inventing a sampled color', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    vi.stubGlobal('document', undefined);
    let api = await load();
    expect(api.adaptiveShadowColor(bitmap(), undefined, '#123456')).toBe('#123456');
    vi.resetModules();
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return null;
        }
      },
    );
    api = await load();
    expect(api.adaptiveShadowColor(bitmap(), undefined, '')).toBe('#000000');
    vi.resetModules();
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor() {
          throw new Error('context');
        }
      },
    );
    api = await load();
    expect(api.adaptiveShadowColor(bitmap(), undefined, '#abcdef')).toBe('#abcdef');
  });
  it('does not memoize readback failures', async () => {
    vi.spyOn(Canvas.prototype, 'getContext').mockImplementation(() => {
      const ctx = makeContext();
      ctx.getImageData.mockImplementation(() => {
        throw new Error('readback');
      });
      contexts.push(ctx);
      return ctx;
    });
    const { adaptiveShadowColor: color } = await load(),
      source = bitmap();
    expect(color(source, undefined, '#123456')).toBe('#123456');
    expect(color(source)).toBe('#000000');
    expect(contexts[1]!.getImageData).toHaveBeenCalledTimes(2);
  });
});

describe('batched adaptive shadows', () => {
  it('samples independent frames together and populates exactly the same color/crop keys', async () => {
    const { primeAdaptiveShadowColors: prime, adaptiveShadowColor: color, shadowColorFromPixels: from } = await load();
    const red = bitmap([255, 0, 0, 255]),
      blue = bitmap([0, 0, 255, 255]),
      rect = { x: 5, y: 9, width: 120, height: 80 };
    prime([{ source: red }, { source: blue, sourceRect: rect, fallbackColor: '#123456' }, { source: red }]);
    expect(contexts[0]!.getImageData).toHaveBeenCalledOnce();
    expect(contexts[0]!.drawImage).toHaveBeenCalledTimes(2);
    expect(color(red)).toBe(from(new Uint8ClampedArray([255, 0, 0, 255])));
    expect(color(blue, rect, '#123456')).toBe(from(new Uint8ClampedArray([0, 0, 255, 255])));
    prime([{ source: red }]);
    expect(contexts).toHaveLength(1);
  });
  it('keeps empty, mutable and already sampled requests out of GPU batches', async () => {
    const { primeAdaptiveShadowColors: prime, adaptiveShadowColor: color } = await load();
    prime([]);
    prime([{ source: {} as CanvasImageSource }]);
    expect(contexts).toHaveLength(0);
    const source = bitmap();
    color(source);
    prime([{ source }]);
    expect(contexts).toHaveLength(1);
  });
  it('splits more than 128 independent sources into bounded readbacks', async () => {
    const { primeAdaptiveShadowColors: prime, adaptiveShadowColor: color } = await load();
    const requests = Array.from({ length: 129 }, () => ({ source: bitmap() }));
    prime(requests);
    expect(contexts[0]!.getImageData.mock.calls.map((c) => c.slice(2))).toEqual([
      [1024, 8],
      [8, 8],
    ]);
    color(requests[128]!.source);
    expect(contexts).toHaveLength(1);
  });
  it('does not prime more crop variants than one frame can retain', async () => {
    const { primeAdaptiveShadowColors: prime } = await load(),
      source = bitmap();
    prime(Array.from({ length: 40 }, (_, x) => ({ source, sourceRect: { x, y: 0, width: 20, height: 20 } })));
    expect(contexts[0]!.drawImage).toHaveBeenCalledTimes(32);
  });
  it('does not make optional batching mandatory on runtimes without OffscreenCanvas', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    const { primeAdaptiveShadowColors: prime } = await load();
    expect(() => prime([{ source: bitmap() }])).not.toThrow();
    expect(contexts).toHaveLength(0);
  });
  it('leaves direct color sampling usable when batch context creation fails', async () => {
    vi.spyOn(Canvas.prototype, 'getContext').mockReturnValueOnce(null as unknown as ReturnType<typeof makeContext>);
    const { primeAdaptiveShadowColors: prime, adaptiveShadowColor: color } = await load(),
      source = bitmap();
    prime([{ source }]);
    expect(color(source)).toMatch(/^hsla/);
  });
  it('releases a failed batch and retries without retaining invalid samples', async () => {
    const first = makeContext();
    first.getImageData.mockImplementation(() => {
      throw new Error('readback');
    });
    vi.spyOn(Canvas.prototype, 'getContext').mockReturnValueOnce(first);
    const { primeAdaptiveShadowColors: prime, adaptiveShadowColor: color } = await load(),
      source = bitmap();
    prime([{ source }]);
    prime([{ source }]);
    expect(color(source)).toMatch(/^hsla/);
    expect(contexts).toHaveLength(2);
  });
});
