import { describe, expect, it, vi } from 'vitest';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { TransitionPreset, VisualClip } from '~/media/shared/composition-types';
import { drawWithClipTransition } from './render-transition';

const clipWithEntry = (preset: TransitionPreset) =>
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
    transitions: { entry: { preset, durationMs: 500 }, exit: null },
    enabled: true,
    order: 0,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    appearance: createDefaultClipAppearance('video'),
    isMirrored: false,
    isMirroredY: false,
  }) as VisualClip;

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
    expect(ctx.scale).toHaveBeenCalledWith(0.995, 0.995);
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
    expect(ctx.translate).toHaveBeenCalledWith(-8, 0);
    expect(ctx.scale).not.toHaveBeenCalled();
  });
});
