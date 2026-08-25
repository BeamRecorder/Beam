import { describe, expect, it, vi } from 'vitest';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { CaptionClip, ClipTransitions, TransitionPreset, VisualClip } from '~/media/shared/composition-types';
import { drawWithClipTransition, transitionPointWithClip } from './render-transition';

const clipWithTransitions = (transitions: ClipTransitions) =>
  ({
    id: 'transition-clip',
    kind: 'video',
    name: 'Transition clip',
    assetId: 'video',
    timelineStartMs: 0,
    timelineDurationMs: 1_000,
    sourceInMs: 0,
    sourceDurationMs: 1_000,
    playbackRate: 1,
    transitions,
    enabled: true,
    order: 0,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    appearance: createDefaultClipAppearance('video'),
    isMirrored: false,
    isMirroredY: false,
  }) as VisualClip;

const clipWithEntry = (preset: TransitionPreset, easingPower?: number) =>
  clipWithTransitions({ entry: { preset, durationMs: 500, easingPower }, exit: null });

const context = () =>
  ({
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    globalAlpha: 1,
    filter: '',
  }) as unknown as CanvasRenderingContext2D;

describe('drawWithClipTransition', () => {
  it('pivots a midpoint zoom around a non-zero frame center', () => {
    const ctx = context();
    const draw = vi.fn();
    const frame = { x: 100, y: 50, width: 800, height: 400 };

    drawWithClipTransition(ctx, clipWithEntry({ kind: 'zoom', direction: 'in' }), 250, frame, draw);

    expect(ctx.translate).toHaveBeenCalledWith(500, 250);
    expect(ctx.scale).toHaveBeenCalledWith(0.9875, 0.9875);
    expect(ctx.translate).toHaveBeenCalledWith(-500, -250);
    expect(draw).toHaveBeenCalledOnce();
  });

  it('keeps slide displacement proportional to the video frame dimensions regardless of its origin', () => {
    const ctx = context();

    drawWithClipTransition(
      ctx,
      clipWithEntry({ kind: 'slide', direction: 'left' }),
      250,
      { x: 100, y: 50, width: 800, height: 400 },
      vi.fn(),
    );

    expect(ctx.translate).toHaveBeenCalledOnce();
    expect(ctx.translate).toHaveBeenCalledWith(8, 0);
    expect(ctx.scale).not.toHaveBeenCalled();
  });

  it('uses the transformed clip bounds for slide displacement', () => {
    const ctx = context();
    const clip = clipWithEntry({ kind: 'slide', direction: 'left' });
    clip.transform = { x: 0.25, y: 0.2, width: 0.5, height: 0.4 };

    drawWithClipTransition(ctx, clip, 250, { x: 100, y: 50, width: 800, height: 400 }, vi.fn());

    expect(ctx.translate).toHaveBeenCalledWith(4, 0);
  });

  it('uses the default text bounds when a caption has no explicit transform', () => {
    const ctx = context();
    const caption: CaptionClip = {
      id: 'caption',
      kind: 'caption',
      name: 'Caption',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      transitions: { entry: { preset: { kind: 'slide', direction: 'left' }, durationMs: 500 }, exit: null },
      enabled: true,
      order: 0,
      caption: { type: 'text', sentences: [], style: createDefaultCaptionStyle() },
    };

    drawWithClipTransition(ctx, caption, 250, { width: 1_000, height: 500 }, vi.fn());

    expect(ctx.translate).toHaveBeenCalledWith(8, 0);
  });

  it('maps a point through an entry transition using the same slide transform as the renderer', () => {
    const frame = { x: 100, y: 50, width: 800, height: 400 };
    const point = { x: 500, y: 250 };

    const mapped = transitionPointWithClip(clipWithEntry({ kind: 'slide', direction: 'left' }, 2), 250, frame, point);

    // Entry progress is 1 - (1 - .5)^2 = .75, leaving a +2% frame offset.
    expect(mapped).toEqual({ x: 516, y: 250 });
  });

  it('maps a point through an exit transition using its easing power and centered scale', () => {
    const frame = { x: 100, y: 50, width: 800, height: 400 };
    const clip = clipWithTransitions({
      entry: null,
      exit: { preset: { kind: 'zoom', direction: 'in' }, durationMs: 500, easingPower: 2 },
    });

    const mapped = transitionPointWithClip(clip, 750, frame, { x: 700, y: 350 });

    // Exit progress is .5^2 = .25, leaving 75% of the preset's 10% scale overshoot.
    expect(mapped.x).toBeCloseTo(715);
    expect(mapped.y).toBeCloseTo(357.5);
  });
});
