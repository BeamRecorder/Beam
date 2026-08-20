import { describe, expect, it, vi } from 'vitest';
import { drawCompositionLayers, renderCompositionFrame, type RenderableMedia } from '../render';
import type { CompositionSnapshot } from '../../export-types';
import { DEFAULT_OUTPUT_CANVAS } from '../../../video-editor/canvas/output-canvas';
import type { ClipComposition, ClipAppearance, ClipTransitions, VisualClip } from '~/media/shared/composition-types';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { CursorPackDescriptor } from '../../../../api/types/cursor-pack';
import { MACOS_CURSOR_PACK } from '../../../video-editor/properties/cursor/cursor-packs';
import { createCursorMotionPlayer } from '../../../video-editor/composables/cursor-motion';

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

const wideCursorPack = (): CursorPackDescriptor => ({
  id: 'imported:wide',
  name: 'Wide cursor pack',
  source: 'imported',
  colorMode: 'original',
  defaultCursorId: 'wide-default',
  cursors: [
    {
      id: 'wide-default',
      label: 'Wide default',
      url: 'project-media://cursor/imported-wide/wide-default.svg',
      intrinsicSize: { width: 40, height: 20 },
      nominalSize: 20,
      hotspot: { x: 5, y: 4 },
    },
  ],
  automaticMap: { default: 'wide-default' },
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

describe('canonical composition rendering', () => {
  it('paints the fallback canvas when the screen clip has no available frame', () => {
    const ctx = context();
    renderCompositionFrame(ctx, null, snapshot(), 0);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 50);
  });

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
    const cursorImage = {
      complete: true,
      naturalWidth: 24,
    } as HTMLImageElement;
    const ctx = context();

    renderCompositionFrame(ctx, null, value, 0.5, null, new Map([['default', cursorImage]]));

    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 50);
    expect(ctx.arc).not.toHaveBeenCalled();
    expect((ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.some(([drawn]) => drawn === cursorImage)).toBe(false);
  });

  it('uses crop and transform stored on the screen clip', () => {
    const value = snapshot();
    const screen = value.composition.clips[0];
    if (screen.kind !== 'screen') throw new Error('screen fixture missing');
    screen.crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
    const ctx = context();
    renderCompositionFrame(ctx, { source: {}, width: 100, height: 50 } as RenderableMedia, value, 0);
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 15, 10, 40, 20, 0, 0, 100, 50);
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
              entry: {
                preset: { kind: 'fade' },
                durationMs: 1_000,
                easingPower: power,
              },
              exit: null,
            }
          : {
              entry: null,
              exit: {
                preset: { kind: 'fade' },
                durationMs: 1_000,
                easingPower: power,
              },
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
        rippleSize: 40,
      };
      const cursorImage = {
        complete: true,
        naturalWidth: 24,
      } as HTMLImageElement;
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
      expect(baseline.rippleAlphas.length).toBeGreaterThan(0);
      expect(transitioned.rippleAlphas).toHaveLength(baseline.rippleAlphas.length);
      expect(transitioned.cursorAlphas).toEqual([expect.closeTo(baseline.cursorAlphas[0]! * expectedAlpha, 8)]);
      transitioned.rippleAlphas.forEach((alpha, index) =>
        expect(alpha).toBeCloseTo(baseline.rippleAlphas[index]! * expectedAlpha, 8),
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
          {
            ...screen,
            id: 'screen-first',
            timelineDurationMs: 400,
            sourceDurationMs: 400,
          },
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
      const cursorImage = {
        complete: true,
        naturalWidth: 24,
      } as HTMLImageElement;
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

  it('draws an active imported visual from its canonical clip', () => {
    const value = snapshot();
    value.composition.assets.push({
      id: 'image',
      kind: 'image',
      name: 'Logo',
      fileName: 'logo.png',
      durationMs: 1_000,
      width: 10,
      height: 10,
      src: 'file:///logo.png',
      origin: 'project',
    });
    value.composition.clips.push({
      id: 'logo',
      kind: 'image',
      name: 'Logo',
      assetId: 'image',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 1,
      transform: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      appearance: screenAppearance,
      isMirrored: false,
      isMirroredY: false,
    });
    const image = {
      source: {} as CanvasImageSource,
      width: 10,
      height: 10,
    } as RenderableMedia;
    const ctx = context();
    drawCompositionLayers(ctx, value, 0.2, new Map([['logo', image]]));
    expect(ctx.drawImage).toHaveBeenCalledWith(image.source, 10, 10, 30, 20);
  });

  it.each([30, 60])('does not export an empty frame at a contiguous exit cut (%s fps)', (fps) => {
    const value = snapshot();
    const first: VisualClip = {
      id: 'first',
      kind: 'video',
      name: 'First',
      assetId: 'first-asset',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      transitions: {
        entry: null,
        exit: { preset: { kind: 'fade' }, durationMs: 500 },
      },
      enabled: true,
      order: 1,
      transform: { x: 0, y: 0, width: 1, height: 1 },
      appearance: createDefaultClipAppearance('video'),
      isMirrored: false,
      isMirroredY: false,
    };
    const second: VisualClip = {
      ...first,
      id: 'second',
      name: 'Second',
      assetId: 'second-asset',
      timelineStartMs: 1_000,
      transitions: { entry: null, exit: null },
    };
    value.composition.clips.push(first, second);
    const firstSource = {} as CanvasImageSource;
    const secondSource = {} as CanvasImageSource;
    const visuals = new Map([
      ['first', { source: firstSource, width: 100, height: 50 }],
      ['second', { source: secondSource, width: 100, height: 50 }],
    ] satisfies ReadonlyArray<[string, RenderableMedia]>);
    const renderAt = (timeMs: number) => {
      const ctx = context();
      const calls: Array<{ source: CanvasImageSource; alpha: number }> = [];
      (ctx.drawImage as ReturnType<typeof vi.fn>).mockImplementation((source: CanvasImageSource) => {
        if (source === firstSource || source === secondSource) calls.push({ source, alpha: ctx.globalAlpha });
      });
      drawCompositionLayers(ctx, value, timeMs / 1_000, visuals);
      return calls;
    };
    const frameMs = 1_000 / fps;

    const before = renderAt(1_000 - frameMs);
    expect(before).toHaveLength(1);
    expect(before[0]?.source).toBe(firstSource);
    expect(before[0]?.alpha).toBeCloseTo((frameMs / 500) ** 3, 8);

    const atCut = renderAt(1_000);
    expect(atCut).toEqual([{ source: secondSource, alpha: 1 }]);

    const after = renderAt(1_000 + frameMs);
    expect(after).toEqual([{ source: secondSource, alpha: 1 }]);
  });

  it('exports webcam placement, crop, mirror and complete appearance settings', () => {
    const value = snapshot();
    value.canvas = { ...value.canvas, width: 1000, height: 500 };
    const camera = {
      id: 'camera',
      kind: 'video' as const,
      name: 'Webcam',
      fileName: null,
      durationMs: 1_000,
      width: 100,
      height: 50,
      src: 'file:///camera.mp4',
      origin: 'session' as const,
    };
    value.composition.assets.push(camera);
    value.composition.clips.push({
      id: 'webcam',
      kind: 'webcam',
      name: 'Webcam',
      assetId: camera.id,
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 1,
      transform: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
      isMirrored: true,
      isMirroredY: false,
      appearance: {
        cornerRadius: 42,
        shadowSize: 'none',
        shadowBlur: 0,
        shadowMode: 'solid',
        shadowColor: '#123456',
        shadowDirection: 'top-left',
        borderEnabled: true,
        borderColor: '#abcdef',
        borderWidth: 4,
        frame: 'none',
        frameTitle: '',
        frameColor: '#c0c0c0',
        frameShowMenu: true,
        frameShowScrollbars: true,
        frameChromeScale: 1,
      },
    });
    const source = {
      source: {} as CanvasImageSource,
      width: 100,
      height: 50,
    } as RenderableMedia;
    const ctx = context();
    renderCompositionFrame(
      ctx,
      {
        source: {} as CanvasImageSource,
        width: 100,
        height: 50,
      } as RenderableMedia,
      value,
      0,
      null,
      undefined,
      new Map([['webcam', source]]),
    );
    expect(ctx.drawImage).toHaveBeenCalledWith(
      source.source,
      10,
      10,
      50,
      30,
      expect.closeTo(100, 0.001),
      expect.closeTo(100, 0.001),
      300,
      200,
    );
    expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
    expect(ctx.roundRect).toHaveBeenCalledWith(100, expect.closeTo(100, 0.001), 300, 200, 42);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('keeps webcam layers when the screen frame is temporarily unavailable', () => {
    const value = snapshot();
    value.canvas = { ...value.canvas, width: 1000, height: 500 };
    const camera = {
      id: 'camera',
      kind: 'video' as const,
      name: 'Webcam',
      fileName: null,
      durationMs: 1_000,
      width: 100,
      height: 50,
      src: 'file:///camera.mp4',
      origin: 'session' as const,
    };
    value.composition.assets.push(camera);
    value.composition.clips.push({
      id: 'webcam',
      kind: 'webcam',
      name: 'Webcam',
      assetId: camera.id,
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 1,
      transform: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      appearance: createDefaultClipAppearance('webcam'),
      isMirrored: false,
      isMirroredY: false,
    });
    const source = {
      source: {} as CanvasImageSource,
      width: 100,
      height: 50,
    } as RenderableMedia;
    const ctx = context();
    renderCompositionFrame(ctx, null, value, 0, null, undefined, new Map([['webcam', source]]));
    expect(ctx.drawImage).toHaveBeenCalledWith(source.source, 100, expect.closeTo(100, 0.001), 300, 200);
  });

  it('draws only the caption sentence active at the current time', () => {
    const value = snapshot();
    value.composition.clips.push({
      id: 'caption',
      kind: 'caption',
      name: 'Caption',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 1,
      caption: {
        type: 'text',
        sentences: [{ id: 's', text: 'Visible', startMs: 100, endMs: 300, words: [] }],
        style: {
          ...createDefaultCaptionStyle(20),
          color: '#fff',
          shadowColor: '#000',
          shadowBlur: 0,
          placement: 'bottom',
          wrap: false,
        },
      },
    });
    const ctx = context();
    drawCompositionLayers(ctx, value, 0.2);
    expect(ctx.fillText).toHaveBeenCalledWith('Visible', expect.any(Number), expect.any(Number), expect.any(Number));
  });

  it('wraps captions into separate unconstrained lines when enabled', () => {
    const value = snapshot();
    value.render.sourceWidth = 4_000;
    value.composition.clips.push({
      id: 'wrapped-caption',
      kind: 'caption',
      name: 'Wrapped',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 1,
      transform: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      caption: {
        type: 'text',
        sentences: [
          {
            id: 's',
            text: 'One two three four',
            startMs: 0,
            endMs: 1_000,
            words: [],
          },
        ],
        style: {
          ...createDefaultCaptionStyle(20),
          color: '#fff',
          shadowColor: '#000',
          shadowBlur: 0,
          placement: 'center',
          wrap: true,
        },
      },
    });
    const ctx = context();
    const fillText = ctx.fillText as ReturnType<typeof vi.fn>;
    drawCompositionLayers(ctx, value, 0.2);
    expect(fillText.mock.calls.length).toBeGreaterThan(1);
    expect(fillText.mock.calls.every((call: unknown[]) => call.length === 3)).toBe(true);
    expect(ctx.font).toBe('normal 800 20px sans-serif');
  });

  it('keeps constrained rendering when wrapping is disabled', () => {
    const value = snapshot();
    value.composition.clips.push({
      id: 'nowrap-caption',
      kind: 'caption',
      name: 'No wrap',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 1,
      transform: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      caption: {
        type: 'text',
        sentences: [
          {
            id: 's',
            text: 'One two three four',
            startMs: 0,
            endMs: 1_000,
            words: [],
          },
        ],
        style: {
          ...createDefaultCaptionStyle(20),
          color: '#fff',
          shadowColor: '#000',
          shadowBlur: 0,
          placement: 'center',
          wrap: false,
          extrusionDepth: 0,
        },
      },
    });
    const ctx = context();
    drawCompositionLayers(ctx, value, 0.2);
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    expect(ctx.fillText).toHaveBeenCalledWith(
      'One two three four',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('uses cursor-follow placement for keyboard captions and a fixed export fallback', () => {
    const renderCaptionX = (withCursor: boolean) => {
      const value = snapshot();
      value.canvas = { ...value.canvas, width: 1_000, height: 500 };
      value.composition.clips.push({
        id: 'keyboard-caption',
        kind: 'caption',
        name: 'Ctrl K',
        timelineStartMs: 0,
        timelineDurationMs: 1_000,
        sourceInMs: 0,
        sourceDurationMs: 1_000,
        playbackRate: 1,
        enabled: true,
        order: 1,
        caption: {
          type: 'keyboard',
          steps: [{ offsetMs: 0, modifiers: ['control'], key: 'k' }],
          followCursor: true,
          recordedPlatform: 'windows',
          sourceSessionId: 'session-1',
          style: {
            ...createDefaultCaptionStyle(20),
            wrap: false,
            backdropBlur: 0,
            outlineWidth: 0,
            extrusionDepth: 0,
            shadowBlur: 0,
          },
        },
      });
      if (withCursor) {
        value.cursor = {
          ...value.cursor,
          available: true,
          events: [
            {
              event: 'move',
              sessionNs: 0,
              pixelX: 90,
              pixelY: 40,
              normalizedX: 0.9,
              normalizedY: 0.8,
              visible: true,
            },
          ],
        };
      }
      const ctx = context();
      const cursorImage = {
        complete: true,
        naturalWidth: 24,
      } as HTMLImageElement;
      renderCompositionFrame(
        ctx,
        { source: {} as CanvasImageSource, width: 100, height: 50 },
        value,
        0.1,
        null,
        withCursor ? new Map([['default', cursorImage]]) : undefined,
      );
      const call = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls.find((entry) => entry[0] === 'Ctrl');
      return call?.[1] as number | undefined;
    };

    const fixedX = renderCaptionX(false);
    const followedX = renderCaptionX(true);
    expect(fixedX).toBeDefined();
    expect(followedX).toBeDefined();
    expect(followedX).not.toBe(fixedX);
  });

  it('renders export captions after the cursor layer so captions stay above the cursor', () => {
    const value = snapshot();
    value.composition.clips.push({
      id: 'caption-above-cursor',
      kind: 'caption',
      name: 'Caption above cursor',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 1,
      transform: { x: 0.2, y: 0.2, width: 0.5, height: 0.2 },
      caption: {
        type: 'text',
        sentences: [
          {
            id: 'sentence',
            text: 'Caption above cursor',
            startMs: 0,
            endMs: 1_000,
            words: [],
          },
        ],
        style: {
          ...createDefaultCaptionStyle(20),
          customText: 'Caption above cursor',
          wrap: false,
          outlineWidth: 0,
          extrusionDepth: 0,
          shadowBlur: 0,
        },
      },
    });
    const cursorImage = {
      complete: true,
      naturalWidth: 24,
    } as HTMLImageElement;
    value.cursor = {
      ...value.cursor,
      available: true,
      events: [
        {
          event: 'move',
          sessionNs: 0,
          pixelX: 50,
          pixelY: 25,
          normalizedX: 0.5,
          normalizedY: 0.5,
          visible: true,
        },
      ],
    };
    const ctx = context();

    renderCompositionFrame(
      ctx,
      { source: {} as CanvasImageSource, width: 100, height: 50 },
      value,
      0.2,
      null,
      new Map([['default', cursorImage]]),
    );

    const captionCall = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls.findIndex(
      ([text]) => text === 'Caption above cursor',
    );
    const cursorCall = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.findIndex(
      ([source]) => source === cursorImage,
    );
    expect(captionCall).toBeGreaterThanOrEqual(0);
    expect(cursorCall).toBeGreaterThanOrEqual(0);
    expect((ctx.fillText as ReturnType<typeof vi.fn>).mock.invocationCallOrder[captionCall]).toBeGreaterThan(
      (ctx.drawImage as ReturnType<typeof vi.fn>).mock.invocationCallOrder[cursorCall]!,
    );
  });

  it('exports a right click with its own ripple and rebound settings', () => {
    const value = snapshot();
    value.cursor = {
      available: true,
      telemetry: [],
      missing: [],
      shapes: {},
      catalog: {},
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
          sessionNs: 100_000_000,
          button: 2,
          pressed: true,
          normalizedX: 0.25,
          normalizedY: 0.5,
        },
      ],
    };
    value.cursorSettings.clickEffects = {
      left: {
        springEnabled: false,
        springIntensity: 50,
        rippleEnabled: false,
        rippleSize: 30,
        rippleColor: '#f00',
      },
      right: {
        springEnabled: true,
        springIntensity: 100,
        rippleEnabled: true,
        rippleSize: 60,
        rippleColor: '#00f',
      },
    };
    const ctx = context();
    const image = { complete: true, naturalWidth: 24 } as HTMLImageElement;
    renderCompositionFrame(
      ctx,
      {
        source: {} as CanvasImageSource,
        width: 100,
        height: 50,
      } as RenderableMedia,
      value,
      0.15,
      null,
      new Map([['default', image]]),
    );
    expect(ctx.strokeStyle).toBe('#00f');
    expect(ctx.arc).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      expect.closeTo(18.26, 2),
      0,
      Math.PI * 2,
    );
    expect(ctx.scale).toHaveBeenCalledWith(expect.closeTo(0.707, 3), expect.closeTo(0.707, 3));
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it.each([
    ['single', 1, 0],
    ['double', 2, 0],
    ['solid', 2, 1],
    ['none', 0, 0],
  ] as const)(
    'exports the %s global ripple shape as the expected rings',
    (style, expectedRings, expectedFilledRings) => {
      const value = snapshot();
      value.cursor = {
        available: true,
        telemetry: [],
        missing: [],
        shapes: {},
        catalog: {},
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
            sessionNs: 100_000_000,
            button: 1,
            pressed: true,
            normalizedX: 0.25,
            normalizedY: 0.5,
          },
        ],
      };
      value.cursorSettings.clickEffects.left = {
        springEnabled: false,
        springIntensity: 0,
        rippleEnabled: style !== 'none',
        rippleStyle: style,
        rippleSize: 40,
        rippleColor: '#f00',
      };
      const ctx = context();

      renderCompositionFrame(ctx, { source: {} as CanvasImageSource, width: 100, height: 50 }, value, 0.25, null);

      expect(ctx.arc).toHaveBeenCalledTimes(expectedRings);
      expect(ctx.fill).toHaveBeenCalledTimes(expectedFilledRings);
      expect(ctx.stroke).toHaveBeenCalledTimes(expectedRings - expectedFilledRings);
    },
  );

  it('uses the configured cursor size as output pixels', () => {
    const value = snapshot();
    value.cursor = {
      available: true,
      telemetry: [],
      missing: [],
      shapes: {},
      catalog: {},
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
    value.cursorSettings.size = 50;
    const ctx = context();
    const image = { complete: true, naturalWidth: 24 } as HTMLImageElement;

    renderCompositionFrame(
      ctx,
      {
        source: {} as CanvasImageSource,
        width: 100,
        height: 50,
      } as RenderableMedia,
      value,
      0,
      null,
      new Map([['default', image]]),
    );

    expect(ctx.drawImage).toHaveBeenLastCalledWith(image, expect.any(Number), expect.any(Number), 50, 50);
  });

  it('preserves a non-square pack asset ratio and scales its hotspot', () => {
    const value = snapshot();
    const pack = wideCursorPack();
    value.cursorPack = pack;
    value.cursorSettings.selection = {
      packId: pack.id,
      mode: 'fixed',
      cursorId: 'wide-default',
    };
    value.cursorSettings.size = 20;
    value.cursor = {
      available: true,
      telemetry: [],
      missing: [],
      shapes: {},
      catalog: {},
      events: [
        {
          event: 'move',
          sessionNs: 0,
          pixelX: 50,
          pixelY: 25,
          normalizedX: 0.5,
          normalizedY: 0.5,
          visible: true,
        },
      ],
    };
    const ctx = context();
    const image = { complete: true, naturalWidth: 40 } as HTMLImageElement;

    renderCompositionFrame(
      ctx,
      {
        source: {} as CanvasImageSource,
        width: 100,
        height: 50,
      } as RenderableMedia,
      value,
      0,
      null,
      new Map([['wide-default', image]]),
    );

    expect(ctx.drawImage).toHaveBeenCalledWith(image, -5, -4, 40, 20);
  });

  it('samples cursor motion at the frozen screen source time once per exported frame', () => {
    const value = snapshot();
    const screen = value.composition.clips[0]!;
    if (screen.kind !== 'screen') throw new Error('Expected a screen clip fixture.');
    screen.freezeFrameSourceMs = 250;
    value.cursor = {
      available: true,
      telemetry: [],
      missing: [],
      shapes: {},
      catalog: {},
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
    const motion = createCursorMotionPlayer(value.cursor.events, value.cursorSettings.motion, 100, 50);
    const sample = vi.spyOn(motion, 'sample');
    const image = { complete: true, naturalWidth: 24 } as HTMLImageElement;
    const frames = [0, 1 / 30, 2 / 30];

    for (const time of frames) {
      renderCompositionFrame(
        context(),
        { source: {} as CanvasImageSource, width: 100, height: 50 },
        value,
        time,
        null,
        new Map([['default', image]]),
        undefined,
        motion,
      );
    }

    expect(sample).toHaveBeenCalledTimes(frames.length);
    expect(sample.mock.calls.map(([time]) => time)).toEqual([0.25, 0.25, 0.25]);
  });
});
