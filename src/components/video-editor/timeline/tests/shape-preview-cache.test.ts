import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ANNOTATION_SHAPE_STYLE } from '~/media/shared/shape-layer-style';
import type { ShapeClip } from '~/media/shared/composition-types';
import { createElementText } from '~/media/shared/element-text';
import {
  ShapePreviewCache,
  shapePreviewCache,
  shapePreviewSignature,
  retainShapePreviewCache,
} from '../shape-preview-cache';

const clip: ShapeClip = {
  ...DEFAULT_ANNOTATION_SHAPE_STYLE,
  kind: 'shape',
  id: 'shape',
  name: 'Shape',
  trackId: 'track',
  assetId: '',
  order: 0,
  enabled: true,
  timelineStartMs: 0,
  timelineDurationMs: 1000,
  sourceInMs: 0,
  sourceDurationMs: 1000,
  playbackRate: 1,
  transform: { x: 0.2, y: 0.3, width: 0.4, height: 0.4 },
};
const canvas = { width: 1920, height: 1080 };

beforeEach(() => shapePreviewCache.clear());

describe('shapePreviewSignature', () => {
  it('shares copied artwork despite different IDs, timing, placement, selection and tracks', () => {
    const copy = {
      ...clip,
      id: 'copy',
      trackId: 'different',
      timelineStartMs: 3000,
      timelineDurationMs: 2000,
      order: 5,
      enabled: false,
      transform: { ...clip.transform, x: 0.6, y: 0.1 },
    };
    expect(shapePreviewSignature(copy, canvas)).toBe(shapePreviewSignature(clip, canvas));
  });
  it.each([
    { fillEnabled: true },
    { borderWidth: 20 },
    { rotation: 45 },
    { opacity: 50 },
    { text: createElementText('Text') },
    { transform: { ...clip.transform, width: 0.8 } },
  ])('changes identity after an artwork edit: %j', (edit) => {
    expect(shapePreviewSignature({ ...clip, ...edit }, canvas)).not.toBe(shapePreviewSignature(clip, canvas));
  });
  it('tracks output dimensions and cloned gradient, text and drawing content', () => {
    const detailed = {
      ...clip,
      text: createElementText('First'),
      drawing: {
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        strokeWidth: 4,
        smoothing: 0.5,
      },
    };
    expect(shapePreviewSignature(structuredClone(detailed), canvas)).toBe(shapePreviewSignature(detailed, canvas));
    expect(shapePreviewSignature(detailed, { width: 1280, height: 720 })).not.toBe(
      shapePreviewSignature(detailed, canvas),
    );
    expect(shapePreviewSignature({ ...detailed, text: createElementText('Second') }, canvas)).not.toBe(
      shapePreviewSignature(detailed, canvas),
    );
  });
});

describe('ShapePreviewCache', () => {
  it('coalesces pending and completed artwork across subscribers', async () => {
    const cache = new ShapePreviewCache();
    const render = vi.fn(async () => 'PNG');
    const first = cache.get('same', render);
    expect(cache.get('same', render)).toBe(first);
    await first;
    expect(cache.get('same', render)).toBe(first);
    expect(render).toHaveBeenCalledOnce();
  });
  it('evicts the least recently used artwork within both count and byte budgets', async () => {
    const cache = new ShapePreviewCache(2, 16);
    const render = vi.fn(async () => 'PNG');
    const first = cache.get('a', render);
    await first;
    await cache.get('b', render);
    expect(cache.get('a', render)).toBe(first);
    await cache.get('c', render);
    expect(cache.get('b', render)).not.toBe(first);
    await cache.get('b', render);
    expect(render).toHaveBeenCalledTimes(4);
    const small = new ShapePreviewCache(64, 3);
    await small.get('a', render);
    await small.get('a', render);
    expect(render).toHaveBeenCalledTimes(6);
  });
  it('retries failed renders and rejects invalid cache limits', async () => {
    const cache = new ShapePreviewCache();
    await expect(
      cache.get('broken', async () => {
        throw new Error('PNG failed');
      }),
    ).rejects.toThrow('PNG failed');
    await expect(cache.get('broken', async () => 'ready')).resolves.toBe('ready');
    expect(() => new ShapePreviewCache(-1)).toThrow(RangeError);
    expect(() => new ShapePreviewCache(1.5)).toThrow(RangeError);
    expect(() => new ShapePreviewCache(1, NaN)).toThrow(RangeError);
    const disabled = new ShapePreviewCache(0, 0);
    const render = vi.fn(async () => 'ready');
    await disabled.get('a', render);
    await disabled.get('a', render);
    expect(render).toHaveBeenCalledTimes(2);
  });
  it('invalidates pending work when cleared and ignores late completion of an old entry', async () => {
    const cache = new ShapePreviewCache();
    let complete!: (value: string) => void;
    let current!: () => boolean;
    const old = cache.get('a', (isCurrent) => {
      current = isCurrent;
      return new Promise((resolve) => (complete = resolve));
    });
    await Promise.resolve();
    cache.clear();
    expect(current()).toBe(false);
    const latest = cache.get('a', async () => 'latest');
    await latest;
    complete('old');
    await old;
    expect(cache.get('a', async () => 'unexpected')).toBe(latest);
  });
  it('ignores a late failed evicted request without removing its replacement', async () => {
    const cache = new ShapePreviewCache(1);
    let reject!: (error: Error) => void;
    const old = cache.get('a', () => new Promise((_resolve, fail) => (reject = fail)));
    const failure = expect(old).rejects.toThrow('old');
    await Promise.resolve();
    await cache.get('b', async () => 'b');
    const replacement = cache.get('a', async () => 'new');
    reject(new Error('old'));
    await failure;
    await replacement;
    expect(cache.get('a', async () => 'unexpected')).toBe(replacement);
  });
});

describe('retainShapePreviewCache', () => {
  it('invalidates pending artwork when its final subscriber leaves', async () => {
    const release = retainShapePreviewCache();
    let isCurrent!: () => boolean;
    let complete!: (value: string) => void;
    const pending = shapePreviewCache.get('pending', (current) => {
      isCurrent = current;
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    await Promise.resolve();
    expect(isCurrent()).toBe(true);
    release();
    expect(isCurrent()).toBe(false);
    complete('late');
    await expect(pending).resolves.toBe('late');
  });

  it('starts the next editor subscription with fresh artwork', async () => {
    const releasePrevious = retainShapePreviewCache();
    const previous = shapePreviewCache.get('same', async () => 'previous');
    await previous;
    releasePrevious();
    const releaseNext = retainShapePreviewCache();
    try {
      const next = shapePreviewCache.get('same', async () => 'next');
      expect(next).not.toBe(previous);
      await expect(next).resolves.toBe('next');
    } finally {
      releaseNext();
    }
  });

  it('preserves shared artwork until the last subscriber leaves and releases idempotently', async () => {
    const releaseFirst = retainShapePreviewCache();
    const releaseSecond = retainShapePreviewCache();
    const first = shapePreviewCache.get('a', async () => 'ready');
    await first;
    releaseFirst();
    releaseFirst();
    expect(shapePreviewCache.get('a', async () => 'unexpected')).toBe(first);
    releaseSecond();
    expect(shapePreviewCache.get('a', async () => 'new')).not.toBe(first);
  });
});
