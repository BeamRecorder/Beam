// @vitest-environment node
import { expect, it } from 'vitest';
import { keepMediaResizeAnchor, normalizeMediaRotation, rotateMediaVector } from './media-rotation';

it.each([
  [0, 0],
  [-90, 270],
  [360, 0],
  [810, 90],
  [-720, 0],
  [-0, 0],
  [45.5, 45.5],
])('normalizes %s degrees to %s without accumulating turns', (input, expected) => {
  expect(normalizeMediaRotation(input)).toBe(expected);
});
it.each([NaN, Infinity, -Infinity])('rejects non-finite rotation %s', (input) => {
  expect(() => normalizeMediaRotation(input)).toThrow('finite');
});
it.each([0, 90, -90, 180, 45, 270])('inverts rotation vectors at %s degrees', (degrees) => {
  const result = rotateMediaVector(rotateMediaVector({ x: 120, y: -30 }, degrees), -degrees);
  expect(result.x).toBeCloseTo(120);
  expect(result.y).toBeCloseTo(-30);
});
it('rotates quarter-turn pixel deltas without confusing axes on rectangular canvases', () => {
  const rotated = rotateMediaVector({ x: 40, y: 0 }, 90);
  expect(rotated.x).toBeCloseTo(0);
  expect(rotated.y).toBeCloseTo(40);
});
it('keeps zero vectors stationary and preserves vector length', () => {
  expect(rotateMediaVector({ x: 0, y: 0 }, 45)).toEqual({ x: 0, y: 0 });
  const vector = rotateMediaVector({ x: 3, y: 4 }, 17);
  expect(Math.hypot(vector.x, vector.y)).toBeCloseTo(5);
});
const resized = { x: 0.1, y: 0.2, width: 0.4, height: 0.2 };
it('does no allocation for unrotated resize anchors', () => {
  expect(keepMediaResizeAnchor(resized, { x: 0, y: 0 }, { x: 1, y: 2 }, 360, { width: 100, height: 50 })).toBe(resized);
});
it('keeps the opposite visual corner fixed for a quarter-turn resize', () => {
  const result = keepMediaResizeAnchor(resized, { x: 20, y: 10 }, { x: 30, y: 15 }, 90, { width: 100, height: 50 });
  expect(result.x).toBeCloseTo(-0.05);
  expect(result.y).toBeCloseTo(0.3);
  expect(result.width).toBe(resized.width);
  expect(result.height).toBe(resized.height);
  expect(resized).toEqual({ x: 0.1, y: 0.2, width: 0.4, height: 0.2 });
});
it('keeps unchanged pivots and corrects both axes for half turns', () => {
  expect(keepMediaResizeAnchor(resized, { x: 2, y: 3 }, { x: 2, y: 3 }, 90, { width: 100, height: 50 })).toEqual(
    resized,
  );
  expect(
    keepMediaResizeAnchor(resized, { x: 0, y: 0 }, { x: 10, y: 5 }, 180, { width: 100, height: 50 }),
  ).toMatchObject({ x: -0.1, y: 0 });
});
