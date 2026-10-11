import { describe, expect, it } from 'vitest';
import { localScreenshotDragDelta } from '../screenshot-drag-geometry';

describe('localScreenshotDragDelta', () => {
  const delta = { x: 0.2, y: 0.3 };
  const canvas = { width: 1000, height: 500 };

  it('preserves normalized movement without rotation', () => {
    expect(localScreenshotDragDelta(delta, canvas, 0)).toEqual(delta);
  });

  it.each([
    [90, 0.15, -0.4],
    [-90, -0.15, 0.4],
    [180, -0.2, -0.3],
  ])('converts a %s degree resize into local coordinates on a non-square canvas', (rotation, x, y) => {
    const local = localScreenshotDragDelta(delta, canvas, rotation);
    expect(local.x).toBeCloseTo(x);
    expect(local.y).toBeCloseTo(y);
  });
});
