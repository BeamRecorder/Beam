import { afterEach, describe, expect, it, vi } from 'vitest';
import * as decoratedMedia from '../../composition/appearance/render-decorated-media';
import * as webcam from '../../composition/webcam/webcam-zoom';
import { drawVisualClip, drawWebcamClip } from '../render-media';
import { drawCompositionLayers, renderCompositionFrame } from '../render';
import { context, snapshot } from './render.test-support';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import type { VisualClip } from '@beam/engine/shared/composition-types';

const media = { source: {} as CanvasImageSource, width: 200, height: 100 };
const clip = (kind: VisualClip['kind'] = 'video'): VisualClip => ({
  id: 'media',
  assetId: 'screen-asset',
  kind,
  name: 'Media',
  enabled: true,
  order: 0,
  timelineStartMs: 0,
  timelineDurationMs: 10000,
  sourceInMs: 0,
  sourceDurationMs: 10000,
  playbackRate: 1,
  transform: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
  appearance: { ...createDefaultClipAppearance(kind), frame: 'animated', shadowSize: 'none' },
  isMirrored: true,
  isMirroredY: false,
  rotation: 25,
});
afterEach(() => vi.restoreAllMocks());

describe('shared media framing clocks and scales', () => {
  it.each(['image', 'video', 'screen'] as const)(
    'passes %s geometry, time and appearance scale without changing the clip',
    (kind) => {
      const draw = vi.spyOn(decoratedMedia, 'drawDecoratedMedia').mockImplementation(() => {});
      const value = clip(kind),
        before = structuredClone(value),
        ctx = context();
      drawVisualClip(ctx, value, media, { width: 800, height: 600 }, 750, 0.5);
      expect(draw).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          timeMs: 750,
          shadowScale: 0.5,
          rect: { x: 160, y: 120, width: 480, height: 360 },
          appearance: value.appearance,
          rotation: 25,
          mirrored: true,
        }),
      );
      expect(value).toEqual(before);
    },
  );
  it('retains output pixel units for visual callers without an explicit preview scale', () => {
    const draw = vi.spyOn(decoratedMedia, 'drawDecoratedMedia').mockImplementation(() => {});
    drawVisualClip(context(), clip(), media, { width: 800, height: 600 }, 0);
    expect(draw.mock.calls[0]![1]).toMatchObject({ timeMs: 0, shadowScale: 1 });
  });
  it('passes the camera crop, custom framing default and clock through its local layout', () => {
    const draw = vi.spyOn(webcam, 'drawWebcamOverlay').mockImplementation(() => {});
    const value = clip('webcam'),
      ctx = context();
    value.crop = { x: 0.2, y: 0.1, width: 0.5, height: 0.6 };
    drawWebcamClip(ctx, value, media, { width: 800, height: 600 }, 2200);
    expect(draw.mock.calls[0]!.slice(6)).toEqual([
      expect.objectContaining({ rotation: 25, mirror: true }),
      value.transform,
      value.crop,
      value.appearance,
      'Media',
      1,
      'custom',
      2200,
    ]);
    expect(ctx.scale).not.toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });
  it.each([0, 2])('keeps a %s camera zoom aligned with the same contour and appearance scale', (scale) => {
    const draw = vi.spyOn(webcam, 'drawWebcamOverlay').mockImplementation(() => {});
    const value = clip('webcam'),
      ctx = context();
    value.cameraFramingPreset = 'circle';
    drawWebcamClip(ctx, value, media, { width: 800, height: 600 }, 750, 0.5, { scale, focusX: 300, focusY: 200 });
    expect(ctx.translate).toHaveBeenCalledWith(300, 200);
    expect(ctx.scale).toHaveBeenCalledWith(1 / (scale || 1), 1 / (scale || 1));
    expect(draw.mock.calls[0]!.slice(-3)).toEqual([0.5, 'circle', 750]);
  });
  it('restores the canvas state when camera media rendering fails', () => {
    vi.spyOn(webcam, 'drawWebcamOverlay').mockImplementation(() => {
      throw new Error('GPU unavailable');
    });
    const ctx = context();
    expect(() => drawWebcamClip(ctx, clip('webcam'), media, { width: 800, height: 600 }, 750)).toThrow(
      'GPU unavailable',
    );
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });
  it.each(['screen', 'video', 'image', 'webcam'] as const)(
    'keeps %s border animation on the composition clock across reverse seeks',
    (kind) => {
      const draw = vi.spyOn(decoratedMedia, 'drawDecoratedMedia').mockImplementation(() => {});
      const value = snapshot(),
        item = clip(kind);
      value.composition.clips = [item];
      value.referenceCanvas = { width: 200, height: 100 };
      const visuals = new Map([[item.id, media]]);
      for (const time of [0.75, 2.2, 0.75]) {
        renderCompositionFrame(context(), kind === 'screen' ? media : null, value, time, null, undefined, visuals);
        expect(draw.mock.calls.at(-1)![1]).toMatchObject({ timeMs: time * 1000, shadowScale: 0.5 });
      }
    },
  );
  it.each(['video', 'image', 'webcam'] as const)(
    'passes the clock and scale through standalone %s layer rendering',
    (kind) => {
      const draw = vi.spyOn(decoratedMedia, 'drawDecoratedMedia').mockImplementation(() => {});
      const value = snapshot(),
        item = clip(kind);
      value.composition.clips = [item];
      value.referenceCanvas = { width: 200, height: 100 };
      drawCompositionLayers(context(), value, 0.75, new Map([[item.id, media]]));
      expect(draw.mock.calls.at(-1)![1]).toMatchObject({ timeMs: 750, shadowScale: 0.5 });
    },
  );
});
