import { describe, expect, it } from 'vitest';
import { normalizeRotation, rotationFromPointer, rotationPointerAngle } from './rotation-gesture';

describe('rotation gesture helpers', () => {
  it.each([
    [-45, 315],
    [360, 0],
    [725, 5],
  ])('normalizes %s degrees to %s degrees', (degrees, expected) => {
    expect(normalizeRotation(degrees)).toBe(expected);
  });

  it('computes the pointer angle around the selection center', () => {
    expect(rotationPointerAngle({ x: 100, y: 100 }, { x: 200, y: 100 })).toBe(0);
    expect(rotationPointerAngle({ x: 100, y: 100 }, { x: 100, y: 200 })).toBe(90);
  });

  it('applies pointer movement to the initial rotation', () => {
    const center = { x: 100, y: 100 };
    const initialPointer = { x: 200, y: 100 };

    expect(rotationFromPointer(25, rotationPointerAngle(center, initialPointer), center, { x: 100, y: 200 })).toBe(115);
  });

  it('snaps pointer rotation to fifteen-degree increments when requested', () => {
    const center = { x: 100, y: 100 };
    const initialPointer = { x: 200, y: 100 };
    const targetPointer = {
      x: center.x + Math.cos((20 * Math.PI) / 180) * 100,
      y: center.y + Math.sin((20 * Math.PI) / 180) * 100,
    };

    expect(rotationFromPointer(7, rotationPointerAngle(center, initialPointer), center, targetPointer, true)).toBe(30);
  });
});
