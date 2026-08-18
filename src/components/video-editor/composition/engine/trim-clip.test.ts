import { describe, expect, it } from 'vitest';
import { clipTrimBounds, createComposition, holdClipAtPlayhead, trimClip } from './clip-engine';
import type { ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { sourceTimeAt } from '~/media/shared/timeline-mapping';

const videoAsset = (id: string, durationMs = 5_000): MediaAsset => ({
  id,
  kind: 'video',
  name: id,
  fileName: `${id}.mp4`,
  durationMs,
  width: 1_920,
  height: 1_080,
  src: `${id}.mp4`,
  origin: 'project',
});

const videoClip = (id: string, overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind: 'video',
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs: 0,
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

const assertNoVisualOverlap = (composition: ClipComposition) => {
  const clipsByTrack = new Map<string, VisualClip[]>();
  for (const clip of composition.clips) {
    if (clip.kind !== 'screen' && clip.kind !== 'video' && clip.kind !== 'image' && clip.kind !== 'webcam') continue;
    const track = clipsByTrack.get(clip.trackId!);
    if (track) track.push(clip);
    else clipsByTrack.set(clip.trackId!, [clip]);
  }

  for (const clips of clipsByTrack.values()) {
    const ordered = [...clips].sort((left, right) => left.timelineStartMs - right.timelineStartMs);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      expect(current.timelineStartMs).toBeGreaterThanOrEqual(previous.timelineStartMs + previous.timelineDurationMs);
    }
  }
};

const sourceData = (clip: VisualClip) => ({
  sourceInMs: clip.sourceInMs,
  sourceDurationMs: clip.sourceDurationMs,
  playbackRate: clip.playbackRate,
  timelineDurationMs: clip.timelineDurationMs,
});

const heldComposition = () => {
  const composition = createComposition(
    [
      videoAsset('main-asset'),
      videoAsset('following-asset'),
      videoAsset('following-companion-asset'),
      videoAsset('other-asset'),
    ],
    [
      videoClip('main', {
        assetId: 'main-asset',
        trackId: 'main-track',
        timelineDurationMs: 2_000,
        sourceDurationMs: 2_000,
      }),
      videoClip('following', {
        assetId: 'following-asset',
        trackId: 'main-track',
        groupId: 'following-group',
        timelineStartMs: 2_000,
        timelineDurationMs: 500,
        sourceInMs: 2_000,
        sourceDurationMs: 500,
      }),
      videoClip('following-companion', {
        assetId: 'following-companion-asset',
        trackId: 'companion-track',
        groupId: 'following-group',
        timelineStartMs: 2_000,
        timelineDurationMs: 500,
        sourceInMs: 2_000,
        sourceDurationMs: 500,
      }),
      videoClip('other-track-clip', {
        assetId: 'other-asset',
        trackId: 'other-track',
        order: 1,
        timelineStartMs: 2_000,
        timelineDurationMs: 500,
        sourceInMs: 2_000,
        sourceDurationMs: 500,
      }),
    ],
  );

  let id = 0;
  const held = holdClipAtPlayhead(composition, 'main', 1_000, () => `generated-${++id}`);
  const hold = held.clips.find(
    (clip): clip is VisualClip => clip.kind === 'video' && clip.freezeFrameSourceMs !== undefined,
  );
  if (!hold) throw new Error('Fixture did not create a hold segment.');
  return { held, hold };
};

describe('trimClip ripple behavior', () => {
  it('pushes downstream fragments and grouped companions when a hold is extended', () => {
    const { held, hold } = heldComposition();
    const oldEnd = hold.timelineStartMs + hold.timelineDurationMs;
    const before = new Map(held.clips.map((clip) => [clip.id, clip]));

    const trimmed = trimClip(held, hold.id, 'end', oldEnd + 500);
    const updatedHold = trimmed.clips.find((clip) => clip.id === hold.id) as VisualClip;

    expect(updatedHold).toMatchObject({
      timelineStartMs: hold.timelineStartMs,
      timelineDurationMs: hold.timelineDurationMs + 500,
      sourceInMs: hold.sourceInMs,
      sourceDurationMs: hold.sourceDurationMs + 500,
      freezeFrameSourceMs: hold.freezeFrameSourceMs,
    });
    expect(sourceTimeAt(updatedHold, updatedHold.timelineStartMs + 499)).toBe(hold.freezeFrameSourceMs);
    expect(trimmed.clips).toHaveLength(held.clips.length);

    for (const clip of held.clips) {
      const updated = trimmed.clips.find((entry) => entry.id === clip.id)!;
      if (clip.id === hold.id) continue;
      const shouldRipple =
        clip.timelineStartMs >= oldEnd && (clip.trackId === hold.trackId || clip.groupId === 'following-group');
      expect(updated.timelineStartMs).toBe(clip.timelineStartMs + (shouldRipple ? 500 : 0));
      expect(sourceData(updated as VisualClip)).toEqual(sourceData(clip as VisualClip));
      expect(before.get(clip.id)?.id).toBe(updated.id);
    }

    assertNoVisualOverlap(trimmed);
  });

  it('brings downstream fragments and grouped companions back when a hold is shortened', () => {
    const { held, hold } = heldComposition();
    const oldEnd = hold.timelineStartMs + hold.timelineDurationMs;
    const before = new Map(held.clips.map((clip) => [clip.id, sourceData(clip as VisualClip)]));

    const trimmed = trimClip(held, hold.id, 'end', oldEnd - 500);
    const updatedHold = trimmed.clips.find((clip) => clip.id === hold.id) as VisualClip;

    expect(updatedHold).toMatchObject({
      timelineStartMs: hold.timelineStartMs,
      timelineDurationMs: hold.timelineDurationMs - 500,
      sourceInMs: hold.sourceInMs,
      sourceDurationMs: hold.sourceDurationMs - 500,
      freezeFrameSourceMs: hold.freezeFrameSourceMs,
    });
    expect(sourceTimeAt(updatedHold, updatedHold.timelineStartMs + 499)).toBe(hold.freezeFrameSourceMs);
    expect(trimmed.clips).toHaveLength(held.clips.length);

    for (const clip of held.clips) {
      const updated = trimmed.clips.find((entry) => entry.id === clip.id)!;
      if (clip.id === hold.id) continue;
      const shouldRipple =
        clip.timelineStartMs >= oldEnd && (clip.trackId === hold.trackId || clip.groupId === 'following-group');
      expect(updated.timelineStartMs).toBe(clip.timelineStartMs - (shouldRipple ? 500 : 0));
      expect(sourceData(updated as VisualClip)).toEqual(before.get(clip.id));
    }

    assertNoVisualOverlap(trimmed);
  });

  it('extends a truncated video into available source and pushes the adjacent fragment intact', () => {
    const composition = createComposition(
      [videoAsset('truncated-asset', 3_000), videoAsset('adjacent-asset', 3_000)],
      [
        videoClip('truncated', {
          assetId: 'truncated-asset',
          trackId: 'shared-track',
          timelineDurationMs: 1_000,
          sourceDurationMs: 1_000,
        }),
        videoClip('adjacent', {
          assetId: 'adjacent-asset',
          trackId: 'shared-track',
          timelineStartMs: 1_000,
          timelineDurationMs: 1_000,
          sourceInMs: 1_000,
          sourceDurationMs: 1_000,
        }),
      ],
    );
    const adjacentBefore = composition.clips.find((clip) => clip.id === 'adjacent') as VisualClip;
    const adjacentSourceBefore = sourceData(adjacentBefore);

    const trimmed = trimClip(composition, 'truncated', 'end', 1_500);
    const updated = trimmed.clips.find((clip) => clip.id === 'truncated') as VisualClip;
    const adjacent = trimmed.clips.find((clip) => clip.id === 'adjacent') as VisualClip;

    expect(updated).toMatchObject({
      timelineStartMs: 0,
      timelineDurationMs: 1_500,
      sourceInMs: 0,
      sourceDurationMs: 1_500,
    });
    expect(updated.freezeFrameSourceMs).toBeUndefined();
    expect(sourceTimeAt(updated, 1_499)).toBe(1_499);
    expect(adjacent.timelineStartMs).toBe(1_500);
    expect(sourceData(adjacent)).toEqual(adjacentSourceBefore);
    expect(trimmed.clips).toHaveLength(composition.clips.length);
    assertNoVisualOverlap(trimmed);
  });

  it('uses the same finite source bound for preview clamping and the engine commit', () => {
    const composition = createComposition(
      [videoAsset('bounded-asset', 2_000)],
      [
        videoClip('bounded', {
          assetId: 'bounded-asset',
          sourceInMs: 500,
          sourceDurationMs: 1_000,
          timelineDurationMs: 1_000,
        }),
      ],
    );

    expect(clipTrimBounds(composition, 'bounded', 'end')).toEqual({ minMs: 40, maxMs: 1_500 });
    expect(() => trimClip(composition, 'bounded', 'end', 1_501)).toThrow('Invalid end trim boundary.');
    expect(trimClip(composition, 'bounded', 'end', 1_500).clips[0]).toMatchObject({
      timelineDurationMs: 1_500,
      sourceDurationMs: 1_500,
    });
  });
});
