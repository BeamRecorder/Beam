import { describe, expect, it } from 'vitest';
import { sharedVideoPlan, playbackVideoDecodeKey } from '@beam/runtime/playback/shared-video-plan';
import type { PlaybackClipDescriptor } from '@beam/runtime/playback/playback-types';
const clip = (clipId: string, overrides: Partial<PlaybackClipDescriptor> = {}): PlaybackClipDescriptor => ({
  clipId,
  assetId: 'asset',
  timelineStartSeconds: 0,
  timelineDurationSeconds: 5,
  sourceInSeconds: 0,
  playbackRate: 1,
  ...overrides,
});
describe('shared video decoding', () => {
  it('decodes exact duplicates once and maps every visual layer to its owned frame', () => {
    const a = clip('a'),
      b = clip('b');
    const result = sharedVideoPlan([a, b]);
    expect(result.clips).toEqual([a]);
    expect([...result.aliases]).toEqual([
      ['a', 'a'],
      ['b', 'a'],
    ]);
    expect(playbackVideoDecodeKey(a)).toBe(playbackVideoDecodeKey(b));
  });
  it.each([
    { assetId: 'other' },
    { timelineStartSeconds: 1 },
    { timelineDurationSeconds: 4 },
    { sourceInSeconds: 1 },
    { playbackRate: 2 },
    { freezeFrameSourceSeconds: 0 },
    { freezeFrameSourceSeconds: 1 },
  ])('never shares a different source mapping: %j', (overrides) => {
    expect(sharedVideoPlan([clip('a'), clip('b', overrides)]).clips).toHaveLength(2);
  });
  it('rebuilds leaders deterministically after retiming/removal, including held frames', () => {
    const result = sharedVideoPlan([
      clip('b', { freezeFrameSourceSeconds: 0 }),
      clip('c', { freezeFrameSourceSeconds: 0 }),
    ]);
    expect(result.clips[0]!.clipId).toBe('b');
    expect(result.aliases.get('c')).toBe('b');
    expect(sharedVideoPlan([]).aliases.size).toBe(0);
  });
});
