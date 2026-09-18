import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureCanvasFrame } from '../canvas-frame-capture';

const drawImage = vi.fn();
const context = { drawImage, imageSmoothingEnabled: false, imageSmoothingQuality: 'low' };
let output: { width: number; height: number; convertToBlob: ReturnType<typeof vi.fn> } | null = null;

class TestOffscreenCanvas {
  readonly width: number;
  readonly height: number;
  readonly convertToBlob = vi.fn(async () => ({
    size: 9,
    arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
  }));

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    output = { width, height, convertToBlob: this.convertToBlob };
  }

  getContext() {
    return context;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  drawImage.mockClear();
  output = null;
});

describe('captureCanvasFrame', () => {
  it('copies only the visible output canvas into a full-size PNG', async () => {
    vi.stubGlobal('OffscreenCanvas', TestOffscreenCanvas);
    const source = { width: 1_600, height: 900 } as HTMLCanvasElement;

    const result = await captureCanvasFrame(
      source,
      { width: 800, height: 450 },
      {
        preset: '1:1',
        width: 1_080,
        height: 1_080,
        showBackground: true,
      },
    );

    expect(output).toMatchObject({ width: 1_080, height: 1_080 });
    expect(drawImage).toHaveBeenCalledWith(source, 350, 0, 900, 900, 0, 0, 1_080, 1_080);
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe('high');
    expect(output?.convertToBlob).toHaveBeenCalledWith({ type: 'image/png' });
    expect(result).toMatchObject({ width: 1_080, height: 1_080 });
    expect(result.bytes.byteLength).toBeGreaterThan(0);
  });

  it('rejects capture before the preview is ready', async () => {
    await expect(
      captureCanvasFrame(
        null,
        { width: 800, height: 450 },
        {
          preset: '16:9',
          width: 1_920,
          height: 1_080,
          showBackground: true,
        },
      ),
    ).rejects.toThrow(/not ready/i);
  });
});
