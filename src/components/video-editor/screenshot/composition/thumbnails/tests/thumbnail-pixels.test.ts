import { describe, expect, it } from 'vitest';
import { alphaBounds, fitThumbnail } from '../thumbnail-pixels';

const pixels = (width: number, height: number, points: Array<[number, number, number]> = []) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, alpha] of points) data[(y * width + x) * 4 + 3] = alpha;
  return data;
};

describe('thumbnail pixel geometry', () => {
  it('finds the tight inclusive bounds of visible alpha pixels', () => {
    expect(
      alphaBounds(
        pixels(8, 6, [
          [3, 2, 1],
          [6, 4, 255],
          [4, 2, 128],
        ]),
        8,
        6,
      ),
    ).toEqual({ x: 3, y: 2, width: 4, height: 3 });
  });

  it('returns no bounds for transparent pixels, including a zero-sized surface', () => {
    expect(alphaBounds(pixels(3, 2), 3, 2)).toBeNull();
    expect(alphaBounds(new Uint8ClampedArray(), 0, 0)).toBeNull();
  });

  it('fits wide bounds into the padded thumbnail while preserving aspect ratio', () => {
    expect(fitThumbnail({ x: 10, y: 20, width: 120, height: 40 }, 96)).toEqual({
      x: 6,
      y: 34,
      width: 84,
      height: 28,
    });
  });

  it('fits tall bounds into the padded thumbnail and centers them horizontally', () => {
    const fit = fitThumbnail({ x: 1, y: 2, width: 24, height: 80 }, 96);
    expect(fit.x).toBeCloseTo(35.4);
    expect(fit.y).toBe(6);
    expect(fit.width).toBeCloseTo(25.2);
    expect(fit.height).toBe(84);
  });

  it('allows callers to choose a different output size and padding', () => {
    expect(fitThumbnail({ x: 0, y: 0, width: 20, height: 10 }, 40, 2)).toEqual({
      x: 2,
      y: 11,
      width: 36,
      height: 18,
    });
  });
});
