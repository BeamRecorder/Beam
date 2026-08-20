import { describe, expect, it, vi } from 'vitest';
import { renderCompositionFrame } from '../render';
import type { CompositionSnapshot } from '../../export-types';
import { DEFAULT_OUTPUT_CANVAS } from '../../../video-editor/canvas/output-canvas';
import type { ClipAppearance, ClipComposition, ClipTransitions } from '~/media/shared/composition-types';
import { MACOS_CURSOR_PACK } from '../../../video-editor/properties/cursor/cursor-packs';
import { cursorRippleAt } from '../../../video-editor/composables/cursor-ripple';

const screenAppearance: ClipAppearance = {
  cornerRadius: 'none',
  shadowSize: 'none',
  shadowBlur: 0,
  shadowMode: 'solid',
  shadowColor: '#000000',
  shadowDirection: 'all',
  borderEnabled: false,
  borderColor: '#000000',
  borderWidth: 1,
  frame: 'none',
  frameTitle: '',
  frameColor: '#c0c0c0',
  frameShowMenu: true,
  frameShowScrollbars: true,
  frameChromeScale: 1,
};

const composition = (): ClipComposition => ({
  schemaVersion: 6,
  keyboardCaptionSessions: [],
  assets: [
    {
      id: 'screen-asset',
      kind: 'video',
      name: 'Screen',
      fileName: null,
      durationMs: 1_000,
      width: 100,
      height: 50,
      src: 'file:///screen.mp4',
      origin: 'session',
    },
  ],
  clips: [
    {
      id: 'screen',
      kind: 'screen',
      name: 'Screen',
      assetId: 'screen-asset',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 0,
      transform: { x: 0, y: 0, width: 1, height: 1 },
      appearance: screenAppearance,
      isMirrored: false,
      isMirroredY: false,
    },
  ],
});

const snapshot = (): CompositionSnapshot => ({
  duration: 1,
  render: { sourceWidth: 100, sourceHeight: 50, fps: 30 },
  canvas: { ...DEFAULT_OUTPUT_CANVAS, width: 100, height: 50 },
  background: null,
  blurPercent: 0,
  zooms: [],
  cursor: {
    available: false,
    telemetry: [],
    missing: [],
    shapes: {},
    catalog: {},
    events: [],
  },
  cursorSettings: {
    selection: {
      packId: MACOS_CURSOR_PACK.id,
      mode: 'automatic',
      cursorId: null,
    },
    size: 24,
    color: '#000',
    shadow: { enabled: false, blur: 0, color: '#000', direction: 'bottom' },
    clickEffects: {
      left: {
        springEnabled: true,
        springIntensity: 50,
        rippleEnabled: false,
        rippleSize: 30,
        rippleColor: '#f00',
      },
      right: {
        springEnabled: true,
        springIntensity: 50,
        rippleEnabled: false,
        rippleSize: 30,
        rippleColor: '#00f',
      },
    },
    motion: {
      preset: 'smooth' as const,
      smoothing: 0.67,
      springMassMultiplier: 1.29,
      motionBlur: 0.4,
    },
  },
  cursorPack: MACOS_CURSOR_PACK,
  composition: composition(),
});

const context = () =>
  ({
    fillStyle: '',
    strokeStyle: '',
    filter: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    lineJoin: '',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    globalAlpha: 1,
    lineWidth: 0,
    fillRect: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn((value: string) => ({ width: value.length * 10 })),
    drawImage: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  }) as unknown as CanvasRenderingContext2D;

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
