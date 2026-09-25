import { describe, expect, it } from 'vitest';
import type { VisualClip } from '../composition-types';
import { createDefaultClipAppearance } from '../composition-defaults';
import { activeClipsAt, sessionTimeAt, sourceTimeAt } from '../timeline-mapping';

const frozenVideo = (): VisualClip => ({
  id: 'hold',
  kind: 'video',
  name: 'Hold',
  assetId: 'video-asset',
  timelineStartMs: 500,
  timelineDurationMs: 1_000,
  sourceInMs: 200,
  sourceDurationMs: 2_000,
  playbackRate: 2,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  trackId: 'video-track',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
  freezeFrameSourceMs: 1_234,
});

const contiguousComposition = (cutMs: number) => {
  const makeClip = (id: string, order: number, timelineStartMs: number, timelineDurationMs: number): VisualClip => ({
    id,
    kind: 'video',
    name: id,
    assetId: 'shared-video',
    timelineStartMs,
    timelineDurationMs,
    sourceInMs: timelineStartMs,
    sourceDurationMs: timelineDurationMs,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    enabled: true,
    order,
    trackId: 'video-track',
    transform: { x: 0, y: 0, width: 1, height: 1 },
    appearance: createDefaultClipAppearance('video'),
    isMirrored: false,
    isMirroredY: false,
  });

  return {
    schemaVersion: 6,
    keyboardCaptionSessions: [],
    assets: [],
    clips: [makeClip('first', 0, 0, cutMs), makeClip('second', 1, cutMs, 1_000)],
  };
};

describe('timeline mapping', () => {
  it('maps a trimmed and accelerated session clip to its original recording clock', () => {
    const clip = {
      ...frozenVideo(),
      freezeFrameSourceMs: undefined,
      assetId: 'session-segment',
      timelineStartMs: 2_000,
      timelineDurationMs: 500,
      sourceInMs: 250,
      playbackRate: 2,
    };
    const composition = {
      ...contiguousComposition(1_000),
      assets: [
        {
          id: 'session-segment',
          kind: 'video' as const,
          name: 'Screen',
          fileName: null,
          durationMs: 2_000,
          width: 100,
          height: 50,
          src: '/second.webm',
          origin: 'session' as const,
          sessionStartMs: 7_000,
        },
      ],
      clips: [clip],
    };

    expect(sourceTimeAt(clip, 2_250)).toBe(750);
    expect(sessionTimeAt(clip, 2_250, composition)).toBe(7_750);
    expect(sessionTimeAt(clip, 1_999, composition)).toBeNull();
    expect(sessionTimeAt(clip, 2_500, composition)).toBeNull();
    expect(
      sessionTimeAt(clip, 2_250, { ...composition, assets: [{ ...composition.assets[0]!, origin: 'project' }] }),
    ).toBe(750);
  });

  it('maps every instant of a freeze-frame segment to its captured source timestamp', () => {
    const clip = frozenVideo();

    expect(sourceTimeAt(clip, 499)).toBeNull();
    expect(sourceTimeAt(clip, 500)).toBe(1_234);
    expect(sourceTimeAt(clip, 999)).toBe(1_234);
    expect(sourceTimeAt(clip, 1_499)).toBe(1_234);
    expect(sourceTimeAt(clip, 1_500)).toBeNull();
  });

  it('keeps a nominal 30 fps boundary contiguous despite millisecond rounding residue', () => {
    const cutMs = 32_300;
    const frameTimeMs = (969 / 30) * 1_000;
    const value = contiguousComposition(cutMs);

    expect(frameTimeMs).toBeLessThan(cutMs);
    expect(activeClipsAt(value, frameTimeMs).map((clip) => clip.id)).toEqual(['second']);
    expect(activeClipsAt(value, cutMs - 1).map((clip) => clip.id)).toEqual(['first']);
    expect(activeClipsAt(value, cutMs).map((clip) => clip.id)).toEqual(['second']);
  });
});
