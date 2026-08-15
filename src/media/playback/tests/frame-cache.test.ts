import { describe, expect, it, vi } from 'vitest';
import { FRAME_CACHE_LIMIT_BYTES, FrameLruCache } from '../frame-cache';
import type { MediaFrame } from '../../shared';

const frame = (clipId: string, byteSize: number) =>
  ({
    clipId,
    bitmap: {} as ImageBitmap,
    timestampSeconds: 0,
    durationSeconds: 1,
    width: 1,
    height: 1,
    byteSize,
    close: vi.fn(),
  }) satisfies MediaFrame;

describe('FrameLruCache construction and limits', () => {
  it('uses the 64 MiB default and accepts positive safe integer limits', () => {
    const cache = new FrameLruCache();
    const first = frame('first', FRAME_CACHE_LIMIT_BYTES);
    expect(FRAME_CACHE_LIMIT_BYTES).toBe(64 * 2 ** 20);
    expect(cache.set('first', first)).toEqual([]);
    expect(cache.byteSize).toBe(FRAME_CACHE_LIMIT_BYTES);
    expect(cache.get('first')).toBe(first);

    expect(() => new FrameLruCache(1)).not.toThrow();
    expect(() => new FrameLruCache(Number.MAX_SAFE_INTEGER)).not.toThrow();
  });

  it('rejects zero, negative, fractional, and non-finite limits', () => {
    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => new FrameLruCache(limit)).toThrowError(RangeError);
    }
  });

  it('rejects limits above the safe integer range', () => {
    expect(() => new FrameLruCache(Number.MAX_SAFE_INTEGER + 1)).toThrowError(RangeError);
    expect(() => new FrameLruCache(Number.MAX_SAFE_INTEGER + 1000)).toThrowError(RangeError);
    expect(() => new FrameLruCache(Number.MIN_VALUE)).toThrowError(RangeError);
  });
});

describe('FrameLruCache.set', () => {
  it('inserts frames and tracks size and bytes', () => {
    const cache = new FrameLruCache(100);
    const first = frame('first', 40);
    const second = frame('second', 60);

    expect(cache.set('first', first)).toEqual([]);
    expect(cache.set('second', second)).toEqual([]);
    expect(cache.size).toBe(2);
    expect(cache.byteSize).toBe(100);
    expect(cache.get('first')).toBe(first);
    expect(cache.get('second')).toBe(second);
    expect(first.close).not.toHaveBeenCalled();
    expect(second.close).not.toHaveBeenCalled();
  });

  it('replaces a key, closes the old frame, and updates accounting', () => {
    const cache = new FrameLruCache(100);
    const oldFrame = frame('old', 30);
    const replacement = frame('replacement', 70);

    cache.set('key', oldFrame);
    expect(cache.set('key', replacement)).toEqual([]);
    expect(oldFrame.close).toHaveBeenCalledOnce();
    expect(replacement.close).not.toHaveBeenCalled();
    expect(cache.size).toBe(1);
    expect(cache.byteSize).toBe(70);
    expect(cache.get('key')).toBe(replacement);
  });

  it('evicts least-recently-used frames in order', () => {
    const cache = new FrameLruCache(10);
    const first = frame('first', 4);
    const second = frame('second', 4);
    const third = frame('third', 4);
    cache.set('first', first);
    cache.set('second', second);
    cache.get('first');

    expect(cache.set('third', third)).toEqual(['second']);
    expect(second.close).toHaveBeenCalledOnce();
    expect(cache.get('second')).toBeUndefined();
    expect(cache.size).toBe(2);
    expect(cache.byteSize).toBe(8);
  });

  it('evicts at the exact 64 MiB boundary only after exceeding it', () => {
    const cache = new FrameLruCache(FRAME_CACHE_LIMIT_BYTES);
    const first = frame('first', 32 * 2 ** 20);
    const second = frame('second', 32 * 2 ** 20);
    const third = frame('third', 1);

    expect(cache.set('first', first)).toEqual([]);
    expect(cache.set('second', second)).toEqual([]);
    expect(cache.byteSize).toBe(FRAME_CACHE_LIMIT_BYTES);
    expect(cache.set('third', third)).toEqual(['first']);
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).not.toHaveBeenCalled();
    expect(cache.size).toBe(2);
    expect(cache.byteSize).toBe(32 * 2 ** 20 + 1);
  });

  it('keeps an oversized newest frame as a singleton', () => {
    const cache = new FrameLruCache(10);
    const oldFrame = frame('old', 2);
    const oversized = frame('oversized', 100);
    cache.set('old', oldFrame);

    expect(cache.set('oversized', oversized)).toEqual(['old']);
    expect(oldFrame.close).toHaveBeenCalledOnce();
    expect(cache.get('old')).toBeUndefined();
    expect(cache.get('oversized')).toBe(oversized);
    expect(cache.size).toBe(1);
    expect(cache.byteSize).toBe(100);
  });
});

describe('FrameLruCache.get', () => {
  it('returns a hit and promotes it to most recently used', () => {
    const cache = new FrameLruCache(10);
    const first = frame('first', 3);
    const second = frame('second', 3);
    cache.set('first', first);
    cache.set('second', second);

    expect(cache.get('first')).toBe(first);
    const third = frame('third', 5);
    expect(cache.set('third', third)).toEqual(['second']);
    expect(cache.get('first')).toBe(first);
  });

  it('returns undefined for a miss without changing accounting', () => {
    const cache = new FrameLruCache(10);
    const first = frame('first', 3);
    cache.set('first', first);

    expect(cache.get('missing')).toBeUndefined();
    expect(cache.size).toBe(1);
    expect(cache.byteSize).toBe(3);
    expect(first.close).not.toHaveBeenCalled();
  });

  it('returns the same frame object and never closes it', () => {
    const cache = new FrameLruCache(10);
    const first = frame('first', 3);
    cache.set('first', first);

    expect(cache.get('first')).toBe(first);
    expect(cache.get('first')).toBe(first);
    expect(first.close).not.toHaveBeenCalled();
  });
});

describe('FrameLruCache.delete', () => {
  it('deletes an existing frame, closes it, and updates bytes', () => {
    const cache = new FrameLruCache(20);
    const first = frame('first', 7);
    const second = frame('second', 5);
    cache.set('first', first);
    cache.set('second', second);

    cache.delete('first');
    expect(first.close).toHaveBeenCalledOnce();
    expect(cache.get('first')).toBeUndefined();
    expect(cache.size).toBe(1);
    expect(cache.byteSize).toBe(5);
    expect(second.close).not.toHaveBeenCalled();
  });

  it('does nothing for a missing key', () => {
    const cache = new FrameLruCache(20);
    const first = frame('first', 7);
    cache.set('first', first);

    cache.delete('missing');
    expect(first.close).not.toHaveBeenCalled();
    expect(cache.size).toBe(1);
    expect(cache.byteSize).toBe(7);
  });

  it('is idempotent for repeated deletion of the same key', () => {
    const cache = new FrameLruCache(20);
    const first = frame('first', 7);
    cache.set('first', first);

    cache.delete('first');
    cache.delete('first');
    expect(first.close).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
    expect(cache.byteSize).toBe(0);
  });
});

describe('FrameLruCache.clear', () => {
  it('closes every stored frame and resets size and bytes', () => {
    const cache = new FrameLruCache(20);
    const first = frame('first', 7);
    const second = frame('second', 5);
    cache.set('first', first);
    cache.set('second', second);

    cache.clear();
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
    expect(cache.byteSize).toBe(0);
    expect(cache.get('first')).toBeUndefined();
  });

  it('is idempotent and does not close frames again', () => {
    const cache = new FrameLruCache(20);
    const first = frame('first', 7);
    cache.set('first', first);

    cache.clear();
    cache.clear();
    expect(first.close).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
    expect(cache.byteSize).toBe(0);
  });

  it('is safe on an empty cache and can be reused afterward', () => {
    const cache = new FrameLruCache(20);
    expect(() => cache.clear()).not.toThrow();
    const first = frame('first', 7);
    cache.set('first', first);
    expect(cache.size).toBe(1);
    expect(cache.byteSize).toBe(7);
  });
});
