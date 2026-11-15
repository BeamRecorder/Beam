import { describe, expect, it } from 'vitest';
import { isShadowDistance, shadowDistance, shadowOffset } from './shadow';
import { normalizeShapeLayerStyle, isShapeLayerStyle } from './shape-layer-style';
import { normalizeColorLayerStyle, isColorLayerStyle } from './color-layer-style';

describe('independent shadow distance', () => {
  it.each(['all', 'bottom', 'bottom-right', 'top-left', undefined])(
    'preserves legacy displacement for %s',
    (direction) => {
      const offset = shadowOffset(direction, undefined, 12);
      expect(offset).toEqual(
        direction === 'top-left'
          ? { x: -12, y: -12 }
          : direction === 'bottom-right'
            ? { x: 12, y: 12 }
            : direction === 'bottom'
              ? { x: 0, y: 12 }
              : { x: 0, y: 0 },
      );
    },
  );
  it.each(['bottom', 'bottom-right', 'top-left'])('treats authored %s distance as actual separation', (direction) => {
    const offset = shadowOffset(direction, 40, 12);
    expect(Math.hypot(offset.x, offset.y)).toBeCloseTo(40);
    expect(shadowOffset(direction, 0, 12)).toEqual({
      x: direction === 'top-left' ? -0 : 0,
      y: direction === 'top-left' ? -0 : 0,
    });
    expect(shadowOffset(direction, 40, 96)).toEqual(offset);
  });
  it('keeps all-around shadows centered even with a stored distance', () => {
    expect(shadowOffset('all', 40, 12)).toEqual({ x: 0, y: 0 });
  });
  it('displays legacy distance, zero for centered shadows and exact authored values', () => {
    expect(shadowDistance('all', undefined, 12)).toBe(0);
    expect(shadowDistance('bottom', undefined, 12)).toBe(12);
    expect(shadowDistance('bottom-right', undefined, 12)).toBeCloseTo(12 * Math.SQRT2);
    expect(shadowDistance('top-left', undefined, 12)).toBeCloseTo(12 * Math.SQRT2);
    expect(shadowDistance('bottom', 0, 12)).toBe(0);
    expect(shadowDistance('top-left', 25, 12)).toBe(25);
  });
  it.each([undefined, 0, 25, 256])('accepts omitted and bounded distances: %s', (distance) => {
    expect(isShadowDistance(distance)).toBe(true);
    expect(normalizeShapeLayerStyle({ shadowDistance: distance }).shadowDistance).toBe(distance);
    expect(normalizeColorLayerStyle({ shadowDistance: distance }).shadowDistance).toBe(distance);
    expect(isShapeLayerStyle(normalizeShapeLayerStyle({ shadowDistance: distance }))).toBe(true);
  });
  it.each([-1, 257, NaN, Infinity, '25', null])('rejects invalid distances: %s', (distance) => {
    expect(isShadowDistance(distance)).toBe(false);
  });
  it.each([-1, 257, NaN, Infinity])('rejects invalid persisted style distances: %s', (shadowDistance) => {
    expect(isColorLayerStyle({ shadowDistance })).toBe(false);
    expect(isShapeLayerStyle({ ...normalizeShapeLayerStyle({}), shadowDistance })).toBe(false);
  });
});
