import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createImmutableMediaCache,
  isImmutableMedia,
} from '@beam/runtime/composition/appearance/immutable-media-cache';

class Bitmap {}
class Frame {}
beforeEach(() => {
  vi.stubGlobal('ImageBitmap', Bitmap);
  vi.stubGlobal('VideoFrame', Frame);
});
afterEach(() => vi.unstubAllGlobals());
const source = (value: object) => value as CanvasImageSource;

describe('immutable media cache', () => {
  it('recognizes both kinds of immutable decoded frames', () => {
    expect(isImmutableMedia(source(new Bitmap()))).toBe(true);
    expect(isImmutableMedia(source(new Frame()))).toBe(true);
    expect(isImmutableMedia(source({}))).toBe(false);
  });
  it('does not assume missing global constructors exist', () => {
    vi.stubGlobal('ImageBitmap', undefined);
    vi.stubGlobal('VideoFrame', undefined);
    expect(isImmutableMedia(source({}))).toBe(false);
  });
  it('shares variants only within one decoded frame and one crop', () => {
    const cache = createImmutableMediaCache<string>();
    const one = source(new Bitmap()),
      two = source(new Bitmap());
    cache.set(one, 'crop', 'first');
    cache.set(one, 'full', 'second');
    expect(cache.get(one, 'crop')).toBe('first');
    expect(cache.get(one, 'full')).toBe('second');
    expect(cache.get(two, 'crop')).toBeUndefined();
  });
  it('never freezes a mutable canvas/video source', () => {
    const cache = createImmutableMediaCache<number>();
    const canvas = source({ width: 10, height: 10 });
    cache.set(canvas, 'crop', 1);
    expect(cache.get(canvas, 'crop')).toBeUndefined();
  });
  it('bounds crop variants without evicting a replacement unnecessarily', () => {
    const cache = createImmutableMediaCache<number>(),
      frame = source(new Frame());
    for (let i = 0; i < 32; i++) cache.set(frame, String(i), i);
    cache.set(frame, '1', 100);
    expect(cache.get(frame, '0')).toBe(0);
    cache.set(frame, '32', 32);
    expect(cache.get(frame, '0')).toBeUndefined();
    expect(cache.get(frame, '1')).toBe(100);
    expect(cache.get(frame, '32')).toBe(32);
  });
});
