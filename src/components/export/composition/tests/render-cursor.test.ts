import { describe, expect, it, vi } from 'vitest';
import { renderCompositionFrame } from '../render';
import type { ClipTransitions } from '~/media/shared/composition-types';
import { cursorRippleAt } from '../../../video-editor/composables/cursor-ripple';
import { context, snapshot } from './render.test-support';

const transitionContext = () => {
  const ctx = context();
  const alphaStack: number[] = [];
  (ctx.save as ReturnType<typeof vi.fn>).mockImplementation(() => alphaStack.push(ctx.globalAlpha));
  (ctx.restore as ReturnType<typeof vi.fn>).mockImplementation(() => {
    ctx.globalAlpha = alphaStack.pop() ?? 1;
  });
  return ctx;
};

describe('cursor and ripple composition rendering', () => {
  it('does not export cursor or ripples when the active screen has no video frame', () => {
    const value = snapshot();
    value.cursor = {
      ...value.cursor,
      available: true,
      events: [
        {
          event: 'move',
          sessionNs: 0,
          pixelX: 25,
          pixelY: 25,
          normalizedX: 0.25,
          normalizedY: 0.5,
          visible: true,
        },
        {
          event: 'button',
          sessionNs: 250_000_000,
          button: 1,
          pressed: true,
          normalizedX: 0.25,
          normalizedY: 0.5,
        },
      ],
    };
    value.cursorSettings.motion.motionBlur = 0;
    value.cursorSettings.clickEffects.left = {
      ...value.cursorSettings.clickEffects.left,
      rippleEnabled: true,
      rippleSize: 40,
    };
    const cursorImage = { complete: true, naturalWidth: 24 } as HTMLImageElement;
    const ctx = context();

    renderCompositionFrame(ctx, null, value, 0.5, null, new Map([['default', cursorImage]]));

    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 50);
    expect(ctx.arc).not.toHaveBeenCalled();
    expect((ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.some(([drawn]) => drawn === cursorImage)).toBe(false);
  });

  it.each([
    ['entry', 1, 0.5],
    ['entry', 5, 1 - 0.5 ** 5],
    ['exit', 1, 0.5],
    ['exit', 5, 0.5 ** 5],
  ] as const)(
    'multiplies exported screen cursor and ripple alpha by %s easing (power %s)',
    (edge, power, expectedAlpha) => {
      const value = snapshot();
      const screen = value.composition.clips[0];
      if (screen.kind !== 'screen') throw new Error('screen fixture missing');
      const transitions: ClipTransitions =
        edge === 'entry'
          ? {
              entry: { preset: { kind: 'fade' }, durationMs: 1_000, easingPower: power },
              exit: null,
            }
          : {
              entry: null,
              exit: { preset: { kind: 'fade' }, durationMs: 1_000, easingPower: power },
            };
      value.cursor = {
        ...value.cursor,
        available: true,
        events: [
          {
            event: 'move',
            sessionNs: 0,
            pixelX: 25,
            pixelY: 25,
            normalizedX: 0.25,
            normalizedY: 0.5,
            visible: true,
          },
          {
            event: 'button',
            sessionNs: 250_000_000,
            button: 1,
            pressed: true,
            normalizedX: 0.25,
            normalizedY: 0.5,
          },
        ],
      };
      value.cursorSettings.motion.motionBlur = 0;
      value.cursorSettings.clickEffects.left = {
        ...value.cursorSettings.clickEffects.left,
        rippleEnabled: true,
        rippleStyle: 'double',
        rippleSize: 40,
      };
      const cursorImage = { complete: true, naturalWidth: 24 } as HTMLImageElement;
      const renderCursorSamples = (currentTransitions: ClipTransitions) => {
        screen.transitions = currentTransitions;
        const ctx = transitionContext();
        const rippleAlphas: number[] = [];
        const cursorAlphas: number[] = [];
        (ctx.arc as ReturnType<typeof vi.fn>).mockImplementation(() => rippleAlphas.push(ctx.globalAlpha));
        (ctx.drawImage as ReturnType<typeof vi.fn>).mockImplementation((drawn: CanvasImageSource) => {
          if (drawn === cursorImage) cursorAlphas.push(ctx.globalAlpha);
        });
        renderCompositionFrame(
          ctx,
          { source: {} as CanvasImageSource, width: 100, height: 50 },
          value,
          0.5,
          null,
          new Map([['default', cursorImage]]),
        );
        return { rippleAlphas, cursorAlphas };
      };

      const baseline = renderCursorSamples({ entry: null, exit: null });
      const transitioned = renderCursorSamples(transitions);
      const expectedRings = cursorRippleAt(0.25, 40, 'double')!.rings;
      expect(baseline.rippleAlphas.length).toBeGreaterThan(0);
      expect(transitioned.rippleAlphas).toHaveLength(expectedRings.length);
      expect(transitioned.cursorAlphas).toEqual([expect.closeTo(baseline.cursorAlphas[0]! * expectedAlpha, 8)]);
      transitioned.rippleAlphas.forEach((alpha, index) =>
        expect(alpha).toBeCloseTo(expectedAlpha * expectedRings[index]!.opacity, 8),
      );
    },
  );

  it.each(['no active screen', 'disabled screen', 'screen gap'] as const)(
    'does not export cursor/ripples with %s',
    (mode) => {
      const value = snapshot();
      const screen = value.composition.clips[0];
      if (screen.kind !== 'screen') throw new Error('screen fixture missing');
      if (mode === 'no active screen') value.composition.clips = [];
      if (mode === 'disabled screen') screen.enabled = false;
      if (mode === 'screen gap') {
        value.composition.clips = [
          { ...screen, id: 'screen-first', timelineDurationMs: 400, sourceDurationMs: 400 },
          {
            ...screen,
            id: 'screen-second',
            timelineStartMs: 600,
            sourceInMs: 600,
            sourceDurationMs: 400,
          },
        ];
      }
      value.cursor = {
        ...value.cursor,
        available: true,
        events: [
          {
            event: 'move',
            sessionNs: 0,
            pixelX: 25,
            pixelY: 25,
            normalizedX: 0.25,
            normalizedY: 0.5,
            visible: true,
          },
        ],
      };
      const cursorImage = { complete: true, naturalWidth: 24 } as HTMLImageElement;
      const source = {} as CanvasImageSource;
      const ctx = transitionContext();

      renderCompositionFrame(
        ctx,
        { source, width: 100, height: 50 },
        value,
        0.5,
        null,
        new Map([['default', cursorImage]]),
      );

      expect((ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.some(([drawn]) => drawn === source)).toBe(false);
      expect((ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.some(([drawn]) => drawn === cursorImage)).toBe(
        false,
      );
    },
  );
});
