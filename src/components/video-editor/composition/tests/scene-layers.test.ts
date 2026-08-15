import { describe, expect, it } from 'vitest';
import type { ClipComposition, VisualClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { resolveCompositionSceneLayers } from '../scene-layers';

const visual = (kind: VisualClip['kind'], id: string, order: number, enabled = true): VisualClip => ({
  id,
  kind,
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled,
  order,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance(kind),
  isMirrored: false,
  isMirroredY: false,
});

const composition = (...clips: VisualClip[]): ClipComposition => ({
  schemaVersion: 3,
  keyboardCaptionSessions: [],
  assets: [],
  clips,
});

describe('resolveCompositionSceneLayers', () => {
  it('keeps the screen in camera space and imported video/image clips in viewport space', () => {
    const layers = resolveCompositionSceneLayers(
      composition(
        visual('screen', 'screen', 0),
        visual('video', 'imported-video', 2),
        visual('image', 'imported-image', 1),
        visual('webcam', 'camera', 3),
      ),
      500,
    );

    expect(layers.screen?.id).toBe('screen');
    expect(layers.cameraVisuals.map((clip) => clip.id)).toEqual(['screen']);
    expect(layers.viewportVisuals.map((clip) => clip.id)).toEqual(['imported-video', 'imported-image']);
    expect(layers.webcams.map((clip) => clip.id)).toEqual(['camera']);
  });

  it('sorts each visual space independently by front-to-back order', () => {
    const layers = resolveCompositionSceneLayers(
      composition(
        visual('screen', 'screen-back', 0),
        visual('screen', 'screen-front', 5),
        visual('video', 'video-back', 1),
        visual('image', 'image-front', 4),
        visual('video', 'video-front', 6),
      ),
      500,
    );

    expect(layers.screen?.id).toBe('screen-front');
    expect(layers.cameraVisuals.map((clip) => clip.id)).toEqual(['screen-front', 'screen-back']);
    expect(layers.viewportVisuals.map((clip) => clip.id)).toEqual(['video-front', 'image-front', 'video-back']);
  });

  it('omits disabled and inactive clips from every scene layer', () => {
    const outside = visual('image', 'outside', 0);
    outside.timelineStartMs = 2_000;
    const disabled = visual('video', 'disabled', 1, false);

    const layers = resolveCompositionSceneLayers(
      composition(visual('screen', 'screen', 0), outside, disabled, visual('webcam', 'camera', 2)),
      500,
    );

    expect(layers.cameraVisuals.map((clip) => clip.id)).toEqual(['screen']);
    expect(layers.viewportVisuals).toEqual([]);
    expect(layers.webcams.map((clip) => clip.id)).toEqual(['camera']);
  });
});
