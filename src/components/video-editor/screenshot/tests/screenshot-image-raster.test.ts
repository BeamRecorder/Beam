import { describe, expect, it } from 'vitest';
import { screenshotImageRaster } from '../screenshot-image-raster';

describe('screenshot thumbnail raster geometry', () => {
  it('returns the original framing unchanged when the drawable has intrinsic resolution', () => {
    const framing = {
      rect: { x: 16, y: 24, width: 800, height: 600 },
      sourceRect: { x: 100, y: 80, width: 1_200, height: 900 },
    };

    expect(screenshotImageRaster(framing, { width: 1_600, height: 1_200 })).toBe(framing);
  });

  it('scales only source sampling coordinates while preserving the rendered layout and intrinsic crop size', () => {
    const rect = { x: 24, y: 40, width: 720, height: 540 };
    const framing = {
      rect,
      sourceRect: { x: 1_000, y: 500, width: 2_000, height: 1_500 },
    };

    const raster = screenshotImageRaster(framing, {
      width: 4_000,
      height: 3_000,
      rasterSize: { width: 512, height: 384 },
    });

    expect(raster).toEqual({
      rect,
      sourceSize: { width: 2_000, height: 1_500 },
      sourceRect: { x: 128, y: 64, width: 256, height: 192 },
    });
    expect(raster.rect).toBe(rect);
  });

  it('uses each raster axis scale and keeps the exact original crop aspect for rounded dimensions', () => {
    const framing = {
      rect: { x: 0, y: 0, width: 900, height: 500 },
      sourceRect: { x: 1_000, y: 600, width: 1_500, height: 1_200 },
    };

    const raster = screenshotImageRaster(framing, {
      width: 4_000,
      height: 3_001,
      rasterSize: { width: 512, height: 384 },
    });

    expect(raster.sourceRect.x).toBe(128);
    expect(raster.sourceRect.y).toBeCloseTo((600 * 384) / 3_001, 10);
    expect(raster.sourceRect.width).toBe(192);
    expect(raster.sourceRect.height).toBeCloseTo((1_200 * 384) / 3_001, 10);
    expect(raster.sourceSize).toEqual({ width: 1_500, height: 1_200 });
  });
});
