import { describe, expect, it } from 'vitest';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { createComposition } from './engine/clip-engine';
import type { AudioClip, Clip, ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import { removeTimelineGap, timelineGaps } from './timeline-gaps';
import type { TimelineGap } from './timeline-lock-types';

const asset = (id: string, kind: MediaAsset['kind'] = 'video'): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: `${id}.${kind === 'audio' ? 'wav' : 'mp4'}`,
  durationMs: 60_000,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `/media/${id}`,
  origin: 'project',
});

const visual = (id: string, startMs: number, overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind: 'video',
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs: startMs,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  trackId: `${id}-track`,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const microphone = (id: string, startMs: number, overrides: Partial<AudioClip> = {}): AudioClip => ({
  id,
  kind: 'audio',
  role: 'microphone',
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs: startMs,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  volume: 100,
  ...overrides,
});

const composition = (clips: Clip[]): ClipComposition => {
  const assets = clips
    .filter((clip): clip is Exclude<Clip, { kind: 'caption' }> => 'assetId' in clip && Boolean(clip.assetId))
    .map((clip) => asset(clip.assetId, clip.kind === 'audio' ? 'audio' : 'video'))
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index);
  return createComposition(assets, clips);
};

const lane = (next: ClipComposition, ids: string[]) => next.clips.filter((clip) => ids.includes(clip.id));

const gapBetween = (next: ClipComposition, ids: string[], startMs?: number) => {
  const gap = timelineGaps(lane(next, ids)).find((candidate) => startMs === undefined || candidate.startMs === startMs);
  if (!gap) throw new Error('Expected a timeline gap.');
  return gap;
};

const clipAt = (next: ClipComposition, id: string) => {
  const clip = next.clips.find((entry) => entry.id === id);
  if (!clip) throw new Error(`Missing clip ${id}`);
  return clip;
};

describe('timeline gaps', () => {
  it('finds leading and internal gaps, ignores overlaps, and omits the trailing range', () => {
    const clips = [
      visual('first', 1_000, { trackId: 'lane' }),
      visual('second', 2_500, { trackId: 'lane' }),
      visual('overlap', 3_000, { trackId: 'lane' }),
      visual('last', 6_000, { trackId: 'lane' }),
    ];

    expect(timelineGaps(clips)).toEqual([
      { clipIds: ['first', 'second', 'overlap', 'last'], startMs: 0, endMs: 1_000 },
      { clipIds: ['first', 'second', 'overlap', 'last'], startMs: 2_000, endMs: 2_500 },
      { clipIds: ['first', 'second', 'overlap', 'last'], startMs: 4_000, endMs: 6_000 },
    ]);
    expect(timelineGaps([visual('only', 4_000)])).toEqual([{ clipIds: ['only'], startMs: 0, endMs: 4_000 }]);
    expect(timelineGaps([])).toEqual([]);
  });

  it('removes a leading gap by moving every later clip in that lane left', () => {
    const next = composition([
      visual('first', 1_000, { trackId: 'lane' }),
      visual('second', 3_000, { trackId: 'lane' }),
      visual('unrelated', 3_000, { trackId: 'other-lane' }),
    ]);
    const gap = gapBetween(next, ['first', 'second'], 0);

    const result = removeTimelineGap(next, gap);

    expect(clipAt(result, 'first').timelineStartMs).toBe(0);
    expect(clipAt(result, 'second').timelineStartMs).toBe(2_000);
    expect(clipAt(result, 'unrelated').timelineStartMs).toBe(3_000);
  });

  it('recomputes the lane gap and rejects stale bounds, incomplete ids, and another lane', () => {
    const next = composition([
      visual('lane-before', 0, { trackId: 'lane' }),
      visual('lane-after', 3_000, { trackId: 'lane' }),
      visual('other-before', 0, { trackId: 'other-lane' }),
      visual('other-after', 4_000, { trackId: 'other-lane' }),
    ]);
    const currentGap = gapBetween(next, ['lane-before', 'lane-after'], 1_000);

    const staleBounds: TimelineGap = { ...currentGap, endMs: 2_500 };
    const incompleteIds: TimelineGap = { ...currentGap, clipIds: ['lane-before'] };
    const otherLane: TimelineGap = { ...currentGap, clipIds: ['other-before', 'other-after'] };

    expect(removeTimelineGap(next, staleBounds)).toBe(next);
    expect(removeTimelineGap(next, incompleteIds)).toBe(next);
    expect(removeTimelineGap(next, otherLane)).toBe(next);
  });

  it('rejects a stale gap payload that omits a downstream clip from the same visual lane', () => {
    const next = composition([
      visual('lane-before', 0, { trackId: 'lane' }),
      visual('lane-after', 3_000, { trackId: 'lane' }),
      visual('lane-later', 5_000, { trackId: 'lane' }),
    ]);
    const staleSubset: TimelineGap = {
      clipIds: ['lane-before', 'lane-after'],
      startMs: 1_000,
      endMs: 3_000,
    };

    expect(removeTimelineGap(next, staleSubset)).toBe(next);
    expect(clipAt(next, 'lane-after').timelineStartMs).toBe(3_000);
    expect(clipAt(next, 'lane-later').timelineStartMs).toBe(5_000);
  });

  it('shifts downstream linked media with one delta and preserves twelve unrelated tracks and source data', () => {
    const unrelated = Array.from({ length: 11 }, (_, index) =>
      visual(`track-${index + 1}`, 0, { trackId: `track-${index + 1}`, order: index + 1 }),
    );
    const next = composition([
      visual('before', 0, { trackId: 'target-lane' }),
      visual('after', 3_000, { trackId: 'target-lane', groupId: 'recording' }),
      microphone('recording-mic', 3_000, { groupId: 'recording' }),
      ...unrelated,
    ]);
    const originalSource = JSON.stringify(next);
    const originalUnrelated = unrelated.map((entry) => clipAt(next, entry.id));
    const gap = gapBetween(next, ['before', 'after'], 1_000);

    const result = removeTimelineGap(next, gap);

    expect(result).not.toBe(next);
    expect(clipAt(result, 'before').timelineStartMs).toBe(0);
    expect(clipAt(result, 'after').timelineStartMs).toBe(1_000);
    expect(clipAt(result, 'recording-mic').timelineStartMs).toBe(1_000);
    expect(
      new Set(result.clips.filter((clip) => 'trackId' in clip && clip.trackId).map((clip) => clip.trackId)),
    ).toHaveLength(12);
    for (const original of originalUnrelated) expect(clipAt(result, original.id)).toBe(original);
    expect(result.assets).toBe(next.assets);
    expect(JSON.stringify(next)).toBe(originalSource);
  });

  it('does not ripple when the downstream clip or a linked companion is locked', () => {
    const lockedDirect = composition([
      visual('before-direct', 0, { trackId: 'lane' }),
      visual('after-direct', 3_000, { trackId: 'lane', locked: true }),
    ]);
    const directGap = gapBetween(lockedDirect, ['before-direct', 'after-direct'], 1_000);
    expect(removeTimelineGap(lockedDirect, directGap)).toBe(lockedDirect);

    const lockedLinked = composition([
      visual('before-linked', 0, { trackId: 'lane' }),
      visual('after-linked', 3_000, { trackId: 'lane', groupId: 'recording' }),
      microphone('locked-mic', 3_000, { groupId: 'recording', locked: true }),
    ]);
    const linkedGap = gapBetween(lockedLinked, ['before-linked', 'after-linked'], 1_000);
    expect(removeTimelineGap(lockedLinked, linkedGap)).toBe(lockedLinked);
  });

  it('rejects a ripple that would be clamped by a collision on a linked visual track', () => {
    const next = composition([
      visual('main-before', 0, { trackId: 'main-lane' }),
      visual('main-after', 3_000, { trackId: 'main-lane', groupId: 'recording' }),
      visual('companion-before', 1_000, { trackId: 'companion-lane' }),
      visual('companion-after', 3_000, { trackId: 'companion-lane', groupId: 'recording' }),
    ]);
    const gap = gapBetween(next, ['main-before', 'main-after'], 1_000);

    expect(removeTimelineGap(next, gap)).toBe(next);
    expect(clipAt(next, 'main-after').timelineStartMs).toBe(3_000);
    expect(clipAt(next, 'companion-after').timelineStartMs).toBe(3_000);
  });
  it('closes microphone gaps without moving another audio role', () => {
    const next = composition([
      microphone('mic-a', 0),
      microphone('mic-b', 3000),
      { ...microphone('system', 3000), role: 'system' },
    ]);
    const result = removeTimelineGap(next, { clipIds: ['mic-a', 'mic-b'], startMs: 1000, endMs: 3000 });
    expect(clipAt(result, 'mic-b').timelineStartMs).toBe(1000);
    expect(clipAt(result, 'system')).toBe(clipAt(next, 'system'));
  });

  it('rejects empty, missing, unsupported and mixed lane requests', () => {
    const next = composition([visual('video', 1000), { ...microphone('system', 1000), role: 'system' }]);
    for (const clipIds of [[], ['missing'], ['system'], ['video', 'system']]) {
      expect(removeTimelineGap(next, { clipIds, startMs: 0, endMs: 1000 })).toBe(next);
    }
  });
});
