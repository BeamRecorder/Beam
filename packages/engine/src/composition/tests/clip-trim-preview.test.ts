import { describe, expect, it, vi } from 'vitest';
import type { Clip, ClipComposition, VisualClip } from '@beam/engine/shared/composition-types';
import { COMPOSITION_SCHEMA_VERSION } from '../../shared/composition-types';
import { createDefaultClipAppearance, createDefaultCaptionStyle } from '../../shared/composition-defaults';
import { trimClip, clipTrimBounds } from '../../commands/trim-clip';
import { timingPreviewFor } from '../timing-preview';
import { prepareClipTrimPreview } from '../clip-trim-preview';

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

const composition = (...clips: Clip[]): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets: [
    {
      id: 'asset-1',
      kind: 'video',
      name: 'Video',
      src: 'video.mp4',
      fileName: 'video.mp4',
      origin: 'project',
      durationMs: 100_000,
      width: 1920,
      height: 1080,
    },
  ],
  clips,
  keyboardCaptionSessions: [],
});

describe('prepareClipTrimPreview', () => {
  it.each(['start', 'end'] as const)(
    'matches the committed %s trim across grouped rates and repeated reversals',
    (edge) => {
      const video = videoClip('video', {
        groupId: 'group',
        timelineStartMs: 1000,
        sourceInMs: 1000,
        playbackRate: 2,
        sourceDurationMs: 2000,
      });
      const partner = videoClip('partner', {
        kind: 'webcam',
        cameraLayoutPreset: 'custom',
        cameraFramingPreset: 'custom',
        cameraSplitRatio: 0.5,
        cameraSplitPadding: 0,
        groupId: 'group',
        trackId: 'camera',
        order: 1,
        timelineStartMs: 1000,
        sourceInMs: 2000,
        sourceDurationMs: 2000,
        playbackRate: 2,
      });
      const base = composition(video, partner);
      const prepare = prepareClipTrimPreview(base, video.id, edge);
      for (const target of [1500, 1250, 1750, 1500, edge === 'start' ? 1000 : 2000]) {
        const preview = prepare(target);
        expect(preview.composition).toEqual(trimClip(base, video.id, edge, target));
        expect(preview.clips.map((clip) => clip.id)).toEqual(['video', 'partner']);
        expect(base.clips[0]).toBe(video);
        expect(video.timelineDurationMs).toBe(1000);
      }
    },
  );

  it('clears collision ripple when the pointer returns before the next fragment', () => {
    const video = videoClip('video');
    const sibling = videoClip('sibling', { timelineStartMs: 2000, groupId: 'downstream' });
    const companion = videoClip('companion', {
      timelineStartMs: 2000,
      groupId: 'downstream',
      trackId: 'camera',
      order: 1,
    });
    const base = composition(video, sibling, companion);
    const prepare = prepareClipTrimPreview(base, video.id, 'end');
    for (const target of [2500, 1500, 2750, 1000]) {
      const preview = prepare(target);
      expect(preview.composition).toEqual(trimClip(base, video.id, 'end', target));
      expect(preview.clips).toHaveLength(3);
      expect(preview.durationMs).toBe(target > 2000 ? target + 2000 : 3000);
    }
  });

  it('uses sparse intervals without scanning stationary clip timings on pointer updates', () => {
    const video = videoClip('video');
    const stationary = videoClip('stationary', { trackId: 'other', timelineStartMs: 5000, order: 1 });
    Object.defineProperty(stationary, 'timelineStartMs', { configurable: true, get: () => 5000 });
    const readStart = vi.spyOn(stationary, 'timelineStartMs', 'get');
    const base = composition(video, stationary);
    const prepare = prepareClipTrimPreview(base, video.id, 'end');
    readStart.mockClear();
    for (let target = 1000; target < 2000; target += 10) {
      const preview = prepare(target);
      expect(preview.clips).toHaveLength(1);
      expect(preview.durationMs).toBe(6000);
      expect(timingPreviewFor(preview.composition)?.patches.size).toBe(1);
    }
    expect(readStart).not.toHaveBeenCalled();
    const last = prepare(1500);
    expect(
      timingPreviewFor(last.composition)
        ?.at(1499)
        .map((clip) => clip.id),
    ).toEqual(['video']);
    expect(timingPreviewFor(last.composition)?.at(1500)).toEqual([]);
    expect(last.composition.clips[1]).toBe(stationary);
  });

  it('preserves a project duration minimum and rounds the source clock identically to commit', () => {
    const video = videoClip('video', { playbackRate: 1.25, sourceDurationMs: 1250 });
    const base = { ...composition(video), durationMs: 8000 };
    const preview = prepareClipTrimPreview(base, video.id, 'start')(100.4);
    expect(preview.composition).toEqual(trimClip(base, video.id, 'start', 100.4));
    expect(preview.clips[0]).toMatchObject({ sourceInMs: 125, sourceDurationMs: 1125 });
    expect(preview.durationMs).toBe(8000);
  });

  it('keeps a freeze frame source fixed when trimming its start', () => {
    const hold = videoClip('hold', { freezeFrameSourceMs: 420, sourceInMs: 420 });
    const base = composition(hold);
    const preview = prepareClipTrimPreview(base, hold.id, 'start')(250);
    expect(preview.composition).toEqual(trimClip(base, hold.id, 'start', 250));
    expect(preview.clips[0]?.sourceInMs).toBe(420);
  });

  it('starts captions at source zero and retains their styles', () => {
    const caption: Clip = {
      id: 'caption',
      kind: 'caption',
      name: 'Caption',
      caption: { type: 'text', sentences: [], style: createDefaultCaptionStyle() },
      timelineStartMs: 0,
      timelineDurationMs: 2000,
      sourceInMs: 0,
      sourceDurationMs: 2000,
      playbackRate: 1,
      enabled: true,
      order: 0,
    };
    const base = composition(caption);
    const preview = prepareClipTrimPreview(base, caption.id, 'start')(500);
    expect(preview.composition).toEqual(trimClip(base, caption.id, 'start', 500));
    expect(preview.clips[0]?.sourceInMs).toBe(0);
  });

  it('normalizes transitions even when an older clip has none', () => {
    const video = videoClip('video', { transitions: undefined });
    const base = composition(video);
    expect(prepareClipTrimPreview(base, video.id, 'end')(100)).toMatchObject({
      clips: [{ transitions: { entry: null, exit: null } }],
      durationMs: 100,
    });
  });

  it('rejects missing clips and nonfinite or out of source boundaries', () => {
    const base = composition(videoClip('video'));
    expect(() => prepareClipTrimPreview(base, 'missing', 'end')).toThrow('Unknown clip');
    for (const edge of ['start', 'end'] as const) {
      const bounds = clipTrimBounds(base, 'video', edge);
      const prepare = prepareClipTrimPreview(base, 'video', edge);
      for (const time of [NaN, Infinity, -Infinity, bounds.minMs - 1, bounds.maxMs + 1])
        expect(() => prepare(time)).toThrow('Invalid trim preview boundary');
      for (const time of [bounds.minMs, bounds.maxMs])
        expect(prepare(time).composition).toEqual(trimClip(base, 'video', edge, time));
    }
  });
  it('ripples clips after an extended hold and preserves its frozen source', () => {
    const hold = videoClip('hold', {
      timelineStartMs: 1_000,
      timelineDurationMs: 1_000,
      sourceInMs: 1_000,
      sourceDurationMs: 1_000,
      freezeFrameSourceMs: 1_000,
    });
    const downstream = videoClip('downstream', { timelineStartMs: 2_000 });

    const preview = prepareClipTrimPreview(composition(hold, downstream), hold.id, 'end')(2_500).composition;
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

    const preview = prepareClipTrimPreview(composition(video, sibling), video.id, 'end')(1_500).composition;

    expect(preview.clips.find((clip) => clip.id === video.id)).toMatchObject({
      timelineDurationMs: 1_500,
      sourceDurationMs: 1_500,
    });
    expect(preview.clips.find((clip) => clip.id === sibling.id)?.timelineStartMs).toBe(1_500);
  });
});
