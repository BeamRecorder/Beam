import { describe, expect, it } from 'vitest';
import { alignRegionToPixels, regionPixelRect } from './region-pixels';

const full = { x: 0, y: 0, width: 1, height: 1 };

describe('regionPixelRect', () => {
  it('rounds opposite edges independently at fractional pixel positions', () => {
    expect(regionPixelRect({ x: 0.15, y: 0.15, width: 0.25, height: 0.25 }, { width: 10, height: 10 })).toEqual({
      left: 2,
      top: 2,
      right: 4,
      bottom: 4,
    });
  });
  it('preserves odd full-screen dimensions and bottom-right edge pixels', () => {
    expect(regionPixelRect(full, { width: 1921, height: 1081 })).toEqual({
      left: 0,
      top: 0,
      right: 1921,
      bottom: 1081,
    });
    expect(
      regionPixelRect({ x: 0.9999, y: 0.9999, width: 0.0001, height: 0.0001 }, { width: 100, height: 100 }),
    ).toEqual({
      left: 99,
      top: 99,
      right: 100,
      bottom: 100,
    });
  });
  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid source dimensions (%s)', (dimension) => {
    expect(() => regionPixelRect(full, { width: dimension, height: 100 })).toThrow(RangeError);
    expect(() => regionPixelRect(full, { width: 100, height: dimension })).toThrow(RangeError);
  });
  it('keeps a subpixel selection at least one pixel wide and high', () => {
    expect(regionPixelRect({ x: 0, y: 0, width: 0.00001, height: 0.00001 }, { width: 100, height: 100 })).toEqual({
      left: 0,
      top: 0,
      right: 1,
      bottom: 1,
    });
  });
});

describe('alignRegionToPixels', () => {
  it.each([false, true])('leaves an unfinished drawing for gesture cancellation (video=%s)', (video) => {
    for (const region of [
      { ...full, width: 0 },
      { ...full, height: 0 },
    ]) {
      expect(alignRegionToPixels(region, { width: 100, height: 100 }, video)).toBe(region);
    }
  });
  it('keeps odd image dimensions and visibly aligns video dimensions to H.264', () => {
    const region = { x: 0.1, y: 0.1, width: 0.3, height: 0.3 };
    const size = { width: 10, height: 10 };
    expect(alignRegionToPixels(region, size, false)).toEqual(region);
    expect(alignRegionToPixels(region, size, true)).toEqual({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
  });
  it('expands a one-pixel video selection inward at the bottom-right boundary', () => {
    const size = { width: 10, height: 10 };
    const region = { x: 0.9, y: 0.9, width: 0.1, height: 0.1 };
    expect(regionPixelRect(alignRegionToPixels(region, size, true), size)).toEqual({
      left: 8,
      top: 8,
      right: 10,
      bottom: 10,
    });
    expect(regionPixelRect(alignRegionToPixels(region, size, false), size)).toEqual({
      left: 9,
      top: 9,
      right: 10,
      bottom: 10,
    });
  });
  it.each([
    { width: 1, height: 10 },
    { width: 10, height: 1 },
  ])('rejects frames too small for video (%j)', (size) => {
    expect(() => alignRegionToPixels(full, size, true)).toThrow(RangeError);
    expect(alignRegionToPixels(full, size, false)).toEqual(full);
  });
  it.each([1, 1.25, 1.5, 2])('uses actual frame pixels independently of display scaling (%sx)', (scale) => {
    const size = { width: 1000 * scale, height: 500 * scale };
    const region = { x: 0.201, y: 0.102, width: 0.501, height: 0.506 };
    const rect = regionPixelRect(region, size);
    for (const video of [true, false]) {
      const aligned = alignRegionToPixels(region, size, video);
      const captured = regionPixelRect(aligned, size);
      expect(captured.left).toBe(rect.left);
      expect(captured.top).toBe(rect.top);
      expect(captured.right - captured.left).toBe(
        video ? Math.floor((rect.right - rect.left) / 2) * 2 : rect.right - rect.left,
      );
      expect(captured.bottom - captured.top).toBe(
        video ? Math.floor((rect.bottom - rect.top) / 2) * 2 : rect.bottom - rect.top,
      );
      expect(aligned.x + aligned.width).toBeLessThanOrEqual(1);
      expect(aligned.y + aligned.height).toBeLessThanOrEqual(1);
    }
  });
  it('round-trips edge-aligned normalized regions without floating-point overflow', () => {
    for (const size of [
      { width: 1921, height: 1081 },
      { width: 1536, height: 864 },
      { width: 1000, height: 625 },
    ]) {
      for (let pixel = 0; pixel < size.width; pixel += 17) {
        const region = { x: pixel / size.width, y: 0, width: 1 - pixel / size.width, height: 1 };
        for (const video of [true, false]) {
          const aligned = alignRegionToPixels(region, size, video);
          expect(aligned.x + aligned.width).toBeLessThanOrEqual(1);
          const rect = regionPixelRect(aligned, size);
          expect(rect.right).toBeLessThanOrEqual(size.width);
          expect((rect.right - rect.left) % 2).toBe(video ? 0 : (size.width - pixel) % 2);
        }
      }
    }
  });
});
