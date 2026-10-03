import { describe, expect, it, vi } from 'vitest';
import type { ShapeClip } from '@beam/engine/shared/composition-types';
import { cachedShapePath } from '@beam/runtime/composition/shape/shape-path-cache';

describe('shape path ownership', () => {
  it('reuses the native path while geometry remains unchanged', () => {
    const clip = {} as ShapeClip,
      path = {} as Path2D,
      create = vi.fn(() => path);
    expect(cachedShapePath(clip, 'first', create)).toBe(path);
    expect(cachedShapePath(clip, 'first', create)).toBe(path);
    expect(create).toHaveBeenCalledOnce();
  });
  it('does not share across changed geometry or a different immutable clip', () => {
    const one = {} as ShapeClip,
      two = {} as ShapeClip;
    const create = vi.fn(() => ({}) as Path2D);
    const first = cachedShapePath(one, 'a', create);
    expect(cachedShapePath(one, 'b', create)).not.toBe(first);
    expect(cachedShapePath(two, 'a', create)).not.toBe(first);
    expect(create).toHaveBeenCalledTimes(3);
  });
  it('keeps at most four camera/mask geometry variants per live clip', () => {
    const clip = {} as ShapeClip,
      create = vi.fn(() => ({}) as Path2D);
    const first = cachedShapePath(clip, '0', create);
    for (let i = 1; i < 5; i++) cachedShapePath(clip, String(i), create);
    expect(cachedShapePath(clip, '4', create)).toBe(cachedShapePath(clip, '4', create));
    expect(create).toHaveBeenCalledTimes(5);
    expect(cachedShapePath(clip, '0', create)).not.toBe(first);
    expect(create).toHaveBeenCalledTimes(6);
  });
  it('does not retain a failed geometry computation', () => {
    const clip = {} as ShapeClip,
      create = vi.fn(() => {
        throw new Error('path');
      });
    expect(() => cachedShapePath(clip, 'x', create)).toThrow('path');
    expect(() => cachedShapePath(clip, 'x', create)).toThrow('path');
    expect(create).toHaveBeenCalledTimes(2);
  });
});
