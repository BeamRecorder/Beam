import { describe, expect, it } from 'vitest';
import { visualMoveDeltaBounds } from '@beam/engine/commands/visual-move-bounds';
import { videoClip } from '@beam/runtime/playback/tests/media-playback-engine.fixtures';

const clip = (id: string, start: number, duration = 40, trackId = 'lane') =>
  videoClip(id, 'asset-1', {
    timelineStartMs: start,
    timelineDurationMs: duration,
    trackId,
  });
describe('indexed visual move bounds', () => {
  it('honors exact contiguous cuts and ignores stationary items in other lanes', () => {
    const clips = [
      clip('before', 0, 60),
      clip('selected', 100, 40),
      clip('after', 200),
      clip('other', 90, 500, 'other'),
    ];
    expect(visualMoveDeltaBounds(clips, new Set(['selected']))).toEqual({ min: -40, max: 60 });
    expect(visualMoveDeltaBounds(clips, new Set(['before']))).toEqual({ min: 0, max: 40 });
    expect(visualMoveDeltaBounds(clips, new Set(['after']))).toEqual({ min: -60, max: Infinity });
  });
  it('keeps moved fragments out of their own collision limits and handles empty selections', () => {
    const clips = [clip('one', 100), clip('two', 200), clip('after', 300)];
    expect(visualMoveDeltaBounds(clips, new Set(['one', 'two']))).toEqual({ min: -100, max: 60 });
    expect(visualMoveDeltaBounds(clips, new Set())).toEqual({ min: -Infinity, max: Infinity });
    expect(visualMoveDeltaBounds([], new Set(['missing']))).toEqual({ min: -Infinity, max: Infinity });
  });
  it('reads bounded clip metadata when moving the last 5000 of 10000 fragments in one lane', () => {
    let reads = 0;
    const clips = Array.from({ length: 10000 }, (_, i) => {
      const value = clip(String(i), i * 60);
      Object.defineProperty(value, 'timelineStartMs', {
        get: () => {
          reads++;
          return i * 60;
        },
        enumerable: true,
      });
      return value;
    });
    const selected = new Set(clips.slice(5000).map((c) => c.id));
    expect(visualMoveDeltaBounds(clips, selected)).toEqual({ min: -20, max: Infinity });
    expect(reads).toBeLessThan(100000);
  });
});
