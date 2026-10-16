import { describe, expect, it } from 'vitest';
import { detectsCursorHover } from './hover-detection';
import type { HoverDifference, HoverPoint } from './hover-types';

const point = (time: number, x = 0.5, y = 0.4, active = true): HoverPoint => ({ time, x, y, active });
const grid = (rects: number[][] = []): HoverDifference => {
  const pixels = new Uint8Array(64 * 36 * 4);
  for (const [left, top, width, height] of rects)
    for (let y = top!; y < top! + height!; y++)
      for (let x = left!; x < left! + width!; x++) pixels[(y * 64 + x) * 4] = 255;
  return { width: 64, height: 36, pixels };
};
const previous = point(1, 0.5, 0.3),
  current = point(1.016, 0.5, 0.4);
describe('visual hover evidence', () => {
  it('detects entering and leaving a list row along the recorded trajectory', () => {
    expect(
      detectsCursorHover(
        grid([
          [10, 10, 40, 2],
          [10, 14, 40, 2],
        ]),
        null,
        previous,
        current,
      ),
    ).toBe(true);
    expect(detectsCursorHover(grid([[32, 13, 3, 2]]), null, previous, current)).toBe(true);
  });
  it('keeps fast successive row transitions while ignoring persistent animation', () => {
    const before = grid([
      [10, 8, 40, 2],
      [10, 10, 40, 2],
    ]);
    const after = grid([
      [10, 10, 40, 2],
      [10, 14, 40, 2],
    ]);
    expect(detectsCursorHover(after, before.pixels, previous, current)).toBe(true);
    expect(detectsCursorHover(after, after.pixels, previous, current)).toBe(false);
  });
  it.each([
    grid(),
    grid([[1, 1, 8, 3]]),
    grid([[32, 13, 1, 2]]),
    grid([[30, 2, 5, 25]]),
    grid([[0, 0, 64, 36]]),
    grid(Array.from({ length: 18 }, (_, y) => [0, y * 2, 64, 1])),
  ])('rejects blank, unrelated, caret, tall media, scene changes and scrolling', (value) => {
    expect(detectsCursorHover(value, null, previous, current)).toBe(false);
  });
  it.each([
    [null, current],
    [previous, null],
    [point(1, 0.5, 0.3, false), current],
    [previous, point(1.016, 0.5, 0.4, false)],
    [previous, point(1)],
    [previous, point(0.9)],
    [previous, point(1.11)],
    [previous, point(1.016, 0.5, 0.3)],
  ])('rejects inactive, regressing, sparse or stationary movement', (a, b) => {
    expect(detectsCursorHover(grid([[10, 10, 40, 2]]), null, a, b)).toBe(false);
  });
  it('rejects a difference buffer with invalid dimensions instead of reading beyond it', () => {
    expect(() => detectsCursorHover({ ...grid(), pixels: new Uint8Array(3) }, null, previous, current)).toThrow();
    expect(() => detectsCursorHover(grid(), new Uint8Array(3), previous, current)).toThrow();
  });
  it('handles connected components at image corners and narrow vertical highlights', () => {
    expect(detectsCursorHover(grid([[0, 0, 2, 2]]), null, point(1, 0, 0), point(1.016, 0.01, 0.01))).toBe(true);
    expect(detectsCursorHover(grid([[63, 33, 1, 3]]), null, point(1, 0.99, 0.9), point(1.016, 0.99, 0.99))).toBe(true);
  });
});
