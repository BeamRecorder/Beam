import { describe, expect, it } from 'vitest';
import type { ColorClip, VisualClip } from '@beam/engine/shared/composition-types';
import { DEFAULT_CLIP_APPEARANCE } from '@beam/runtime/composition/appearance/render-decorated-media';
import {
  visualAdaptiveShadowRequests,
  visualMediaOptions,
} from '@beam/runtime/composition/appearance/visual-media-options';
const video = (patch: Partial<VisualClip> = {}): VisualClip => ({
  id: 'video',
  kind: 'video',
  name: 'Video',
  assetId: 'asset',
  timelineStartMs: 0,
  timelineDurationMs: 1000,
  sourceInMs: 0,
  sourceDurationMs: 1000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  appearance: { ...DEFAULT_CLIP_APPEARANCE, shadowMode: 'adaptive' },
  isMirrored: true,
  isMirroredY: false,
  ...patch,
});
const media = { source: {} as ImageBitmap, width: 1000, height: 500 },
  canvas = { width: 800, height: 400 };

describe('shared visual framing options', () => {
  it('keeps independent placement, appearance and mirroring over shared video pixels', () => {
    const clip = video(),
      options = visualMediaOptions(clip, media, canvas);
    expect(options).toMatchObject({
      source: media.source,
      rect: { x: 80, y: 80, width: 400, height: 160 },
      appearance: clip.appearance,
      title: 'Video',
      mirrored: true,
      mirroredY: false,
      shadowFollowsSourceAlpha: false,
    });
  });
  it('uses exactly the intrinsic source crop instead of destination coordinates for sampling', () => {
    const options = visualMediaOptions(video({ crop: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 } }), media, canvas);
    expect(options.sourceRect).toEqual({ x: 100, y: 100, width: 800, height: 300 });
  });
  it('preserves alpha-aware image rendering and explicit framing masks', () => {
    expect(visualMediaOptions(video({ kind: 'image' }), media, canvas).shadowFollowsSourceAlpha).toBe(true);
    expect(visualMediaOptions(video({ cameraFramingPreset: 'circle' }), media, canvas).mask).toBe('circle');
  });
});

describe('adaptive shadow request planning', () => {
  it('keeps ordered independently cropped requests for the active visual scene', () => {
    const a = video(),
      b = video({ id: 'second', crop: { x: 0.1, y: 0, width: 0.5, height: 1 } });
    const visuals = new Map([
      ['video', media],
      ['second', media],
    ]);
    const requests = visualAdaptiveShadowRequests([b, a], visuals, canvas);
    expect(requests).toHaveLength(2);
    expect(requests[0]!.sourceRect).toEqual(visualMediaOptions(b, media, canvas).sourceRect);
    expect(requests[1]!.fallbackColor).toBe(a.appearance.shadowColor);
  });
  it('does no work for absent visuals, absent frames and empty scenes', () => {
    expect(visualAdaptiveShadowRequests([], new Map(), canvas)).toEqual([]);
    expect(visualAdaptiveShadowRequests([video()], undefined, canvas)).toEqual([]);
    expect(visualAdaptiveShadowRequests([video()], new Map(), canvas)).toEqual([]);
  });
  it('excludes non-media layers, screen/webcam-special framing and disabled/fixed shadows', () => {
    const clips = [
      video({ kind: 'screen' }),
      video({ kind: 'webcam' }),
      video({ appearance: { ...DEFAULT_CLIP_APPEARANCE, shadowMode: 'solid' } }),
      video({ appearance: { ...DEFAULT_CLIP_APPEARANCE, shadowMode: 'adaptive', shadowSize: 'none' } }),
      { ...video(), kind: 'color', assetId: '' } as unknown as ColorClip,
    ];
    expect(visualAdaptiveShadowRequests(clips, new Map([['video', media]]), canvas)).toEqual([]);
  });
});

it.each(['video', 'image'] as const)('preserves %s rotation independently of framing, crop and mirrors', (kind) => {
  const clip = video({ kind, rotation: 270, crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 } });
  expect(visualMediaOptions(clip, media, canvas)).toMatchObject({
    rotation: 270,
    mirrored: true,
    mirroredY: false,
    sourceRect: { x: 100, y: 100, width: 500, height: 250 },
  });
});
