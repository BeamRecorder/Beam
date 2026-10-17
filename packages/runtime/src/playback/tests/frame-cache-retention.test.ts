import { describe, expect, it, vi } from 'vitest';
import { FrameLruCache } from '@beam/runtime/playback/frame-cache';
import type { MediaFrame } from '@beam/runtime/shared/index';
import { createPlaybackClipIndex } from '@beam/runtime/playback/playback-clip-index';
import { composition, videoClip } from '@beam/runtime/playback/tests/media-playback-engine.fixtures';

const frame = (clipId: string, byteSize = 8): MediaFrame => ({
  clipId,
  byteSize,
  bitmap: {} as ImageBitmap,
  width: 1,
  height: 1,
  timestampSeconds: 0,
  durationSeconds: 1,
  close: vi.fn(),
});

describe('current scene frame retention', () => {
  it('keeps every indispensable frame even when the active scene exceeds the history budget', () => {
    const cache = new FrameLruCache(10);
    const a = frame('a'),
      b = frame('b');
    cache.set('a', a);
    expect(cache.set('b', b, new Set(['a', 'b']))).toEqual([]);
    expect(cache.byteSize).toBe(16);
    expect(cache.get('a')).toBe(a);
    expect(cache.get('b')).toBe(b);
    cache.clear();
    expect(a.close).toHaveBeenCalledOnce();
    expect(b.close).toHaveBeenCalledOnce();
  });
  it('evicts released scene frames and obsolete history rather than pinned current pixels', () => {
    const cache = new FrameLruCache(10);
    const a = frame('a'),
      b = frame('b'),
      next = frame('next');
    cache.set('a', a);
    cache.set('b', b, new Set(['a', 'b']));
    expect(cache.set('next', next, new Set(['next']))).toEqual(['a', 'b']);
    expect(cache.byteSize).toBe(8);
    expect(a.close).toHaveBeenCalledOnce();
    expect(b.close).toHaveBeenCalledOnce();
    expect(next.close).not.toHaveBeenCalled();
  });
  it('does not retain arbitrary prefetched frames when the current scene already fills the budget', () => {
    const cache = new FrameLruCache(10);
    cache.set('a', frame('a'));
    cache.set('b', frame('b'), new Set(['a', 'b']));
    const future = frame('future');
    expect(cache.set('future', future, new Set(['a', 'b']))).toEqual(['future']);
    expect(future.close).toHaveBeenCalledOnce();
  });
  it('retains only enabled active clips with aliases resolved to decoder leaders', () => {
    const index = createPlaybackClipIndex(
      composition([
        videoClip('leader'),
        videoClip('duplicate'),
        videoClip('future', 'asset-1', { timelineStartMs: 3000 }),
        videoClip('disabled', 'asset-1', { enabled: false }),
      ]),
    );
    const keys = new Map([
      ['leader', 'pixels'],
      ['future', 'future-pixels'],
      ['disabled', 'hidden'],
    ]);
    expect(index.retainedKeys(0.5, keys, new Map([['duplicate', 'leader']]))).toEqual(new Set(['pixels']));
    expect(index.retainedKeys(3, keys, new Map())).toEqual(new Set(['future-pixels']));
    expect(index.retainedKeys(6, keys, new Map())).toEqual(new Set());
  });
  it('keeps a contiguous predecessor until the new fragment receives its first pixels', () => {
    const index = createPlaybackClipIndex(
      composition([
        videoClip('before', 'asset-1', { trackId: 'lane' }),
        videoClip('after', 'asset-1', { trackId: 'lane', timelineStartMs: 2000, sourceInMs: 2000 }),
      ]),
    );
    expect(index.retainedKeys(2, new Map([['before', 'old']]), new Map())).toEqual(new Set(['old']));
    expect(
      index.retainedKeys(
        2,
        new Map([
          ['before', 'old'],
          ['after', 'new'],
        ]),
        new Map(),
      ),
    ).toEqual(new Set(['new']));
    expect(createPlaybackClipIndex(null).retainedKeys(0, new Map(), new Map())).toEqual(new Set());
  });
  it('releases every cached frame of removed clips while retaining surviving history', () => {
    const cache = new FrameLruCache(),
      removed = frame('gone'),
      first = frame('keep'),
      second = frame('keep');
    cache.set('gone', removed);
    cache.set('keep:first', first);
    cache.set('keep:second', second);
    cache.retainClips(new Set(['keep']));
    expect(cache.size).toBe(2);
    expect(cache.byteSize).toBe(16);
    expect(removed.close).toHaveBeenCalledOnce();
    expect(first.close).not.toHaveBeenCalled();
    expect(second.close).not.toHaveBeenCalled();
    cache.clear();
    expect(removed.close).toHaveBeenCalledOnce();
  });
  it('keeps every frame when all clip IDs survive and clears empty timelines exactly once', () => {
    const cache = new FrameLruCache(),
      kept = frame('keep');
    cache.set('keep', kept);
    cache.retainClips(new Set(['keep']));
    expect(kept.close).not.toHaveBeenCalled();
    cache.retainClips(new Set());
    cache.retainClips(new Set());
    expect(cache.size).toBe(0);
    expect(cache.byteSize).toBe(0);
    expect(kept.close).toHaveBeenCalledOnce();
  });
  it('does not lend a removed clip cached pixels to another asset reusing its ID', () => {
    const cache = new FrameLruCache(),
      previous = frame('reused');
    cache.set('old', previous);
    cache.retainClips(new Set(['other']));
    expect(cache.findCoveringKey('reused', 0.5)).toBeUndefined();
    const current = frame('reused');
    cache.set('new', current);
    expect(cache.findCoveringKey('reused', 0.5)).toBe('new');
    expect(previous.close).toHaveBeenCalledOnce();
    expect(current.close).not.toHaveBeenCalled();
  });
});
