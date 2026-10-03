import { describe, expect, it } from 'vitest';
import {
  BlurMaskCache,
  BLUR_MASK_CACHE_BYTES,
  BLUR_MASK_CACHE_ENTRIES,
} from '@beam/runtime/composition/effects/blur-mask-cache';
import type { ScratchSurface } from '@beam/runtime/composition/effects/effect-types';
const surface = (width = 10, height = 10) => ({ canvas: { width, height }, context: {} }) as ScratchSurface;
describe('blur geometry mask cache', () => {
  it('clears every owned mask and restores byte/admission accounting', () => {
    const cache = new BlurMaskCache(),
      a = surface(100, 50),
      b = surface(80, 70);
    cache.set('a', a);
    cache.set('b', b);
    cache.clear();
    expect(a.canvas.width).toBe(0);
    expect(b.canvas.height).toBe(0);
    expect(cache.size).toBe(0);
    expect(cache.byteSize).toBe(0);
    expect(cache.canRetain(4096, 2048)).toBe(true);
  });
  it('clears an empty or already cleared cache safely', () => {
    const cache = new BlurMaskCache();
    cache.clear();
    cache.set('a', surface());
    cache.clear();
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });
  it('can admit and release fresh geometry after teardown', () => {
    const cache = new BlurMaskCache();
    cache.set('a', surface());
    cache.clear();
    const fresh = surface(20, 10);
    cache.set('a', fresh);
    expect(cache.get('a')).toBe(fresh);
    expect(cache.byteSize).toBe(800);
  });
  it('admits new geometry only while space remains, avoiding GPU allocation churn', () => {
    const cache = new BlurMaskCache();
    expect(cache.canRetain(10, 10)).toBe(true);
    for (let i = 0; i < BLUR_MASK_CACHE_ENTRIES; i++) cache.set(String(i), surface());
    expect(cache.canRetain(1, 1)).toBe(false);
    expect(cache.get('0')).toBeDefined();
  });
  it('checks remaining bytes before allocating geometry rather than evicting active masks', () => {
    const cache = new BlurMaskCache();
    expect(cache.canRetain(8192, 8192)).toBe(false);
    cache.set('half', surface(2048, 2048));
    expect(cache.canRetain(2048, 2048)).toBe(true);
    cache.set('full', surface(2048, 2048));
    expect(cache.canRetain(1, 1)).toBe(false);
    expect(cache.get('half')).toBeDefined();
  });
  it('permits exact-budget admission into an empty cache', () => {
    const cache = new BlurMaskCache();
    expect(cache.canRetain(4096, 2048)).toBe(true);
    expect(cache.canRetain(4097, 2048)).toBe(false);
  });
  it('accepts reinserting the exact retained surface without clearing its pixels', () => {
    const cache = new BlurMaskCache(),
      mask = surface();
    cache.set('same', mask);
    cache.set('same', mask);
    expect(mask.canvas.width).toBe(10);
    expect(cache.byteSize).toBe(400);
    expect(cache.size).toBe(1);
  });
  it('reuses exact geometry, promotes hits, and releases the least recently used GPU canvas', () => {
    const cache = new BlurMaskCache();
    const first = surface(),
      second = surface();
    cache.set('first', first);
    cache.set('second', second);
    expect(cache.get('first')).toBe(first);
    for (let i = 2; i <= BLUR_MASK_CACHE_ENTRIES; i++) cache.set(String(i), surface());
    expect(cache.get('second')).toBeUndefined();
    expect(second.canvas.width).toBe(0);
    expect(cache.get('first')).toBe(first);
    expect(cache.get('missing')).toBeUndefined();
  });
  it('enforces the byte budget independently of the entry count', () => {
    const cache = new BlurMaskCache();
    const first = surface(2048, 2048),
      second = surface(2048, 2048);
    cache.set('a', first);
    cache.set('b', second);
    expect(cache.byteSize).toBe(BLUR_MASK_CACHE_BYTES);
    cache.set('c', surface(1, 1));
    expect(first.canvas.width).toBe(0);
    expect(cache.size).toBe(2);
    expect(cache.byteSize).toBeLessThan(BLUR_MASK_CACHE_BYTES);
  });
  it('does not retain oversized surfaces and releases replaced entries exactly once', () => {
    const cache = new BlurMaskCache();
    const first = surface();
    cache.set('a', first);
    cache.set('a', surface(20, 10));
    expect(first.canvas.width).toBe(0);
    expect(cache.byteSize).toBe(800);
    const large = surface(8192, 8192);
    cache.set('large', large);
    expect(cache.get('large')).toBeUndefined();
    expect(large.canvas.width).toBe(8192);
    expect(cache.size).toBe(1);
  });
});
