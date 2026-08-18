import { describe, expect, it } from 'vitest';
import type { ClipComposition, VisualClip } from '~/media/shared/composition-types';
import { COMPOSITION_SCHEMA_VERSION, createDefaultClipAppearance } from '~/media/shared';
import { previewClipTrim } from '../timeline-composition-preview';

const videoClip = (id: string, overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind: 'video',
  name: id,
  assetId: 'asset-1',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  trackId: 'video-track',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const composition = (...clips: VisualClip[]): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets: [],
  clips,
  keyboardCaptionSessions: [],
});

describe('previewClipTrim', () => {
  it('ripples clips after an extended hold and preserves its frozen source', () => {
    const hold = videoClip('hold', {
      timelineStartMs: 1_000,
      timelineDurationMs: 1_000,
      sourceInMs: 1_000,
      sourceDurationMs: 1_000,
      freezeFrameSourceMs: 1_000,
    });
    const downstream = videoClip('downstream', { timelineStartMs: 2_000 });

    const preview = previewClipTrim(composition(hold, downstream), hold, 'end', 2_500);
    const previewHold = preview.clips.find((clip) => clip.id === hold.id) as VisualClip;
    const previewDownstream = preview.clips.find((clip) => clip.id === downstream.id) as VisualClip;

    expect(previewHold).toMatchObject({
      timelineStartMs: 1_000,
      timelineDurationMs: 1_500,
      sourceInMs: 1_000,
      sourceDurationMs: 1_500,
      freezeFrameSourceMs: 1_000,
    });
    expect(previewDownstream.timelineStartMs).toBe(2_500);
  });

  it('ripples a sibling when a video end trim extends past its current boundary', () => {
    const video = videoClip('video');
    const sibling = videoClip('sibling', { timelineStartMs: 1_000 });

    const preview = previewClipTrim(composition(video, sibling), video, 'end', 1_500);

    expect(preview.clips.find((clip) => clip.id === video.id)).toMatchObject({
      timelineDurationMs: 1_500,
      sourceDurationMs: 1_500,
    });
    expect(preview.clips.find((clip) => clip.id === sibling.id)?.timelineStartMs).toBe(1_500);
  });
});
