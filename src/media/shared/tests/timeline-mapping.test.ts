import { describe, expect, it } from 'vitest';
import type { VisualClip } from '../composition-types';
import { createDefaultClipAppearance } from '../composition-defaults';
import { sourceTimeAt } from '../timeline-mapping';

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

describe('timeline mapping', () => {
  it('maps every instant of a freeze-frame segment to its captured source timestamp', () => {
    const clip = frozenVideo();

    expect(sourceTimeAt(clip, 499)).toBeNull();
    expect(sourceTimeAt(clip, 500)).toBe(1_234);
    expect(sourceTimeAt(clip, 999)).toBe(1_234);
    expect(sourceTimeAt(clip, 1_499)).toBe(1_234);
    expect(sourceTimeAt(clip, 1_500)).toBeNull();
  });
});
