import { describe, expect, it } from 'vitest';
import type { BlurClip, ClipComposition, ColorClip, ShapeClip } from '~/media/shared/composition-types';
import { DEFAULT_COLOR_FILL } from '~/media/shared/color-fill-types';
import { DEFAULT_COLOR_LAYER_STYLE } from '~/media/shared/color-layer-style';
import { DEFAULT_SHAPE_LAYER_STYLE } from '~/media/shared/shape-layer-style';
import { composition, mountTracks, visual } from './TimelineTracks.test-support';

const baseClip = {
  timelineStartMs: 0,
  sourceInMs: 0,
  sourceDurationMs: 6_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
};

const colorClip = (endMs = 6_000): ColorClip => ({
  ...baseClip,
  id: 'color-track-clip',
  trackId: 'color-track',
  kind: 'color',
  assetId: '',
  name: 'Color',
  timelineDurationMs: endMs,
  sourceDurationMs: endMs,
  order: -1,
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  fill: structuredClone(DEFAULT_COLOR_FILL),
  ...DEFAULT_COLOR_LAYER_STYLE,
});

const shapeClip = (): ShapeClip => ({
  ...baseClip,
  id: 'shape-track-clip',
  trackId: 'shape-track',
  kind: 'shape',
  assetId: '',
  name: 'Shape',
  timelineDurationMs: 6_000,
  order: -2,
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  ...DEFAULT_SHAPE_LAYER_STYLE,
});

const blurClip = (): BlurClip => ({
  ...baseClip,
  id: 'blur-track-clip',
  trackId: 'blur-track',
  kind: 'blur',
  assetId: '',
  name: 'Blur',
  timelineDurationMs: 6_000,
  order: -3,
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  shape: 'rectangle',
  mode: 'blur',
  strength: 40,
  feather: 0,
  cornerRadius: 0,
  tintOpacity: 0,
  color: '#000000',
});

const visualTrackComposition = (extraClips: ClipComposition['clips'] = []): ClipComposition => {
  const base = composition();
  return { ...base, clips: [...base.clips, ...extraClips] };
};

describe('TimelineTracks visual add placement', () => {
  it.each([
    ['image-track', 'image'],
    ['color-track', 'color'],
    ['shape-track', 'shape'],
    ['blur-track', 'blur'],
  ] as const)('shows an Add ghost and emits a continuation request for %s', async (trackId, kind) => {
    const clips =
      kind === 'color' ? [colorClip()] : kind === 'shape' ? [shapeClip()] : kind === 'blur' ? [blurClip()] : [];
    const mounted = await mountTracks({
      composition: visualTrackComposition(clips),
      selectedZoomId: null,
      selectedClipId: null,
    });
    const content = mounted!.get(`[data-track-id="${trackId}"] .visual-content`);

    await content.trigger('mousemove', { clientX: 900 });
    const ghost = content.find('.visual-add-indicator.preview-ghost');
    expect(ghost.exists()).toBe(true);
    expect(ghost.classes()).toContain(`kind-${kind}`);

    await content.trigger('click', { clientX: 900 });
    expect(mounted!.emitted('add:visual-element')).toContainEqual([
      expect.objectContaining({ kind, trackId, durationMs: kind === 'image' ? 5_000 : 3_000 }),
    ]);
  });

  it('shortens the ghost to the available gap and keeps the requested duration in the event', async () => {
    const mounted = await mountTracks({
      composition: visualTrackComposition([colorClip(8_500)]),
      selectedZoomId: null,
      selectedClipId: null,
    });
    const content = mounted!.get('[data-track-id="color-track"] .visual-content');

    await content.trigger('mousemove', { clientX: 1_000 });
    expect(content.find('.visual-add-indicator.preview-ghost').exists()).toBe(true);
    await content.trigger('click', { clientX: 1_000 });

    expect(mounted!.emitted('add:visual-element')).toContainEqual([
      expect.objectContaining({ kind: 'color', trackId: 'color-track', durationMs: 1_500 }),
    ]);
  });

  it('hides the ghost and emits nothing when the remaining gap is shorter than 200 ms', async () => {
    const mounted = await mountTracks({
      composition: visualTrackComposition([colorClip(9_850)]),
      selectedZoomId: null,
      selectedClipId: null,
    });
    const content = mounted!.get('[data-track-id="color-track"] .visual-content');

    await content.trigger('mousemove', { clientX: 1_080 });
    expect(content.find('.visual-add-indicator.preview-ghost').exists()).toBe(false);
    await content.trigger('click', { clientX: 1_080 });

    expect(mounted!.emitted('add:visual-element') ?? []).toHaveLength(0);
  });

  it('does not offer visual continuation on screen, webcam, or video tracks', async () => {
    const mounted = await mountTracks({
      composition: visualTrackComposition([
        visual({
          id: 'video-clip',
          trackId: 'video-track',
          kind: 'video',
          name: 'Video',
          assetId: 'screen-asset',
          timelineStartMs: 0,
          timelineDurationMs: 6_000,
          sourceDurationMs: 6_000,
        }),
      ]),
      selectedZoomId: null,
      selectedClipId: null,
    });

    for (const trackId of ['screen-track', 'webcam-track', 'video-track']) {
      const content = mounted!.get(`[data-track-id="${trackId}"] .visual-content`);
      await content.trigger('mousemove', { clientX: 900 });
      expect(content.find('.visual-add-indicator.preview-ghost').exists()).toBe(false);
      await content.trigger('click', { clientX: 900 });
    }

    expect(mounted!.emitted('add:visual-element') ?? []).toHaveLength(0);
  });
});
