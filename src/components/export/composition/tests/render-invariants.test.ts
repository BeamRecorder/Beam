import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_OUTPUT_CANVAS } from '../../../video-editor/canvas/output-canvas';
import type { ClipAppearance, ClipComposition } from '~/media/shared/composition-types';
import { drawCompositionLayers, renderCompositionFrame, type RenderableMedia } from '../render';
import type { CompositionSnapshot } from '../../export-types';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import { resolveCameraFraming } from '../../../video-editor/composition/camera-layout';
import { drawCanvasTransitionFrame } from '../../../video-editor/composition/transitions/render-canvas-transition';
import type { VisualClip } from '~/media/shared/composition-types';

const appearance: ClipAppearance = {
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
      appearance,
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
  cursor: { available: false, telemetry: [], missing: [], shapes: {}, catalog: {}, events: [] },
  cursorSettings: {
    selectedCursor: 'automatic',
    size: 24,
    color: '#000',
    shadow: { enabled: false, blur: 0, color: '#000', direction: 'bottom' },
    clickEffects: {
      left: { springEnabled: true, springIntensity: 50, rippleEnabled: false, rippleSize: 30, rippleColor: '#f00' },
      right: { springEnabled: true, springIntensity: 50, rippleEnabled: false, rippleSize: 30, rippleColor: '#00f' },
    },
    motion: {
      preset: 'smooth',
      smoothing: 0.67,
      springMassMultiplier: 1.29,
      motionBlur: 0.4,
    },
  },
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

const image = (): RenderableMedia => ({ source: {} as CanvasImageSource, width: 10, height: 10 });

describe('composition rendering invariants', () => {
  it('positions imported visuals in the full output canvas, not inside the transformed screen', () => {
    const value = snapshot();
    const screen = value.composition.clips[0];
    if (screen.kind !== 'screen') throw new Error('screen fixture missing');
    screen.transform = { x: 0.25, y: 0.2, width: 0.5, height: 0.5 };
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
      appearance,
      isMirrored: false,
      isMirroredY: false,
    });
    const visual = image();
    const ctx = context();

    renderCompositionFrame(
      ctx,
      { source: {} as CanvasImageSource, width: 100, height: 50 },
      value,
      0.2,
      null,
      undefined,
      new Map([['logo', visual]]),
    );

    expect(ctx.drawImage).toHaveBeenCalledWith(visual.source, 10, 10, 30, 20);
  });

  it('draws imported visuals inside the global camera transform', () => {
    const value = snapshot();
    value.zooms = [
      {
        id: 'zoom',
        sessionId: 'session',
        startMs: 0,
        endMs: 1_000,
        focus: { cx: 0.8, cy: 0.2 },
        depth: 2,
        mode: 'manual',
      },
    ];
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
      appearance,
      isMirrored: false,
      isMirroredY: false,
    });
    value.composition.clips = value.composition.clips.filter((clip) => clip.kind !== 'screen');
    const visual = image();
    const ctx = context();
    let cameraTransformActive = false;
    const transformStack: boolean[] = [];
    const visualDrawStates: boolean[] = [];
    vi.mocked(ctx.save).mockImplementation(() => {
      transformStack.push(cameraTransformActive);
    });
    vi.mocked(ctx.restore).mockImplementation(() => {
      cameraTransformActive = transformStack.pop() ?? false;
    });
    vi.mocked(ctx.scale).mockImplementation((x, y) => {
      if (x !== 1 || y !== 1) cameraTransformActive = true;
    });
    vi.mocked(ctx.drawImage).mockImplementation(((source: CanvasImageSource) => {
      if (source === visual.source) visualDrawStates.push(cameraTransformActive);
    }) as CanvasRenderingContext2D['drawImage']);

    renderCompositionFrame(ctx, null, value, 0.2, null, undefined, new Map([['logo', visual]]));

    expect((ctx.scale as ReturnType<typeof vi.fn>).mock.calls.some(([scale]) => Number(scale) > 1)).toBe(true);
    expect(visualDrawStates.length).toBeGreaterThanOrEqual(1);
    expect(visualDrawStates.every(Boolean)).toBe(true);
  });

  it('exports fit, portrait and circle framing consistently for screen, video and image media', () => {
    const mediaCases = [
      { kind: 'screen' as const, width: 100, height: 50 },
      { kind: 'video' as const, width: 640, height: 360 },
      { kind: 'image' as const, width: 100, height: 80 },
    ];

    for (const mediaCase of mediaCases) {
      for (const preset of ['fit', 'portrait', 'circle'] as const) {
        const value = snapshot();
        const source = { source: {} as CanvasImageSource, width: mediaCase.width, height: mediaCase.height };
        const target = { x: 0, y: 0, width: value.canvas.width, height: value.canvas.height };
        const framing = resolveCameraFraming(preset, target, source.width, source.height);
        let visuals: Map<string, RenderableMedia> | undefined;

        if (mediaCase.kind === 'screen') {
          const screen = value.composition.clips[0];
          if (screen.kind !== 'screen') throw new Error('screen fixture missing');
          screen.cameraFramingPreset = preset;
        } else {
          const assetId = `${mediaCase.kind}-asset`;
          value.composition.assets = [
            {
              id: assetId,
              kind: mediaCase.kind,
              name: mediaCase.kind,
              fileName: `${mediaCase.kind}.media`,
              durationMs: 1_000,
              width: source.width,
              height: source.height,
              src: `file:///${mediaCase.kind}.media`,
              origin: 'project',
            },
          ];
          const clip: VisualClip = {
            id: mediaCase.kind,
            kind: mediaCase.kind,
            name: mediaCase.kind,
            assetId,
            timelineStartMs: 0,
            timelineDurationMs: 1_000,
            sourceInMs: 0,
            sourceDurationMs: 1_000,
            playbackRate: 1,
            enabled: true,
            order: 0,
            transform: { x: 0, y: 0, width: 1, height: 1 },
            appearance,
            isMirrored: false,
            isMirroredY: false,
            cameraFramingPreset: preset,
          };
          value.composition.clips = [clip];
          visuals = new Map([[clip.id, source]]);
        }

        const ctx = context();
        renderCompositionFrame(ctx, mediaCase.kind === 'screen' ? source : null, value, 0, null, undefined, visuals);
        const drawCall = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.at(-1);
        const sourceRect = framing.sourceRect ?? { x: 0, y: 0, width: source.width, height: source.height };
        if (mediaCase.kind === 'screen' || framing.sourceRect) {
          expect(drawCall).toEqual([
            source.source,
            sourceRect.x,
            sourceRect.y,
            sourceRect.width,
            sourceRect.height,
            framing.rect.x,
            framing.rect.y,
            framing.rect.width,
            framing.rect.height,
          ]);
        } else {
          expect(drawCall).toEqual([
            source.source,
            framing.rect.x,
            framing.rect.y,
            framing.rect.width,
            framing.rect.height,
          ]);
        }
      }
    }
  });

  it('keeps a clip entry transition scoped to a clip that starts at zero', () => {
    const value = snapshot();
    const screen = value.composition.clips[0];
    if (screen.kind !== 'screen') throw new Error('screen fixture missing');
    screen.transitions = { entry: { preset: { kind: 'fade' }, durationMs: 500 }, exit: null };
    const source = { source: {} as CanvasImageSource, width: 100, height: 50 };
    const ctx = context();

    renderCompositionFrame(ctx, source, value, 0);

    expect((ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.some(([drawn]) => drawn === source.source)).toBe(
      true,
    );
  });

  it('renders clip, background and captions into one surface before applying a Canvas transition', () => {
    const value = snapshot();
    value.canvas = {
      ...value.canvas,
      showBackground: true,
      transitions: { entry: { preset: { kind: 'fade' }, durationMs: 500 }, exit: null },
    };
    value.background = { kind: 'color', color: '#123456' };
    const screen = value.composition.clips[0];
    if (screen.kind !== 'screen') throw new Error('screen fixture missing');
    screen.transitions = { entry: { preset: { kind: 'fade' }, durationMs: 500 }, exit: null };
    value.composition.clips.push({
      id: 'caption',
      kind: 'caption',
      name: 'Caption',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      transitions: { entry: null, exit: null },
      enabled: true,
      order: 1,
      caption: {
        type: 'text',
        sentences: [{ id: 'sentence', text: 'Canvas layer', startMs: 0, endMs: 1_000, words: [] }],
        style: { ...createDefaultCaptionStyle(20), wrap: false },
      },
    });
    const surfaceContext = context();
    class FakeOffscreenCanvas {
      width = 0;
      height = 0;
      getContext = vi.fn(() => surfaceContext);
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    try {
      const source = { source: {} as CanvasImageSource, width: 100, height: 50 };
      const ctx = context();
      renderCompositionFrame(ctx, source, value, 0.25);

      const surface = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(surface).toBeInstanceOf(FakeOffscreenCanvas);
      expect(ctx.drawImage).toHaveBeenCalledWith(surface, 0, 0, 100, 50);
      expect((ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.some(([drawn]) => drawn === source.source)).toBe(
        false,
      );
      expect(surfaceContext.fillRect).toHaveBeenCalledWith(0, 0, 100, 50);
      expect(surfaceContext.drawImage).toHaveBeenCalledWith(
        source.source,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(surfaceContext.fillText).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('applies Canvas transition state to the complete preview frame bounds', () => {
    const ctx = context();
    const source = {} as CanvasImageSource;
    const state = { opacity: 0.5, translateX: 0.08, translateY: -0.04, scale: 0.96, blur: 12 };

    drawCanvasTransitionFrame(
      ctx,
      source,
      { width: 100, height: 50 },
      { x: 10, y: 20, width: 200, height: 100 },
      state,
      '#1e1e24',
    );

    expect(ctx.fillRect).toHaveBeenCalledWith(10, 20, 200, 100);
    expect(ctx.translate).toHaveBeenCalledWith(16, -4);
    expect(ctx.scale).toHaveBeenCalledWith(0.96, 0.96);
    expect(ctx.filter).toBe('blur(1.1111111111111112px)');
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 0, 0, 100, 50);
  });

  it('keeps captions above visuals when no screen is present regardless of clip order', () => {
    const value = snapshot();
    value.composition.clips = [];
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
    value.composition.clips.push(
      {
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
        transform: { x: 0, y: 0, width: 1, height: 1 },
        appearance,
        isMirrored: false,
        isMirroredY: false,
      },
      {
        id: 'caption',
        kind: 'caption',
        name: 'Caption',
        timelineStartMs: 0,
        timelineDurationMs: 1_000,
        sourceInMs: 0,
        sourceDurationMs: 1_000,
        playbackRate: 1,
        enabled: true,
        order: 999,
        caption: {
          type: 'text',
          sentences: [{ id: 's', text: 'Foreground', startMs: 0, endMs: 1_000, words: [] }],
          style: {
            ...createDefaultCaptionStyle(20),
            color: '#fff',
            fontSize: 20,
            shadowColor: '#000',
            shadowBlur: 0,
            placement: 'center',
            wrap: false,
            backdropBlur: 0,
            outlineColor: 'transparent',
            outlineWidth: 0,
            extrusionDepth: 0,
          },
        },
      },
    );
    const visual = image();
    const ctx = context();
    drawCompositionLayers(ctx, value, 0.2, new Map([['logo', visual]]));

    const drawImageOrder = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.invocationCallOrder.at(-1);
    const captionOrder = (ctx.fillText as ReturnType<typeof vi.fn>).mock.invocationCallOrder.at(-1);
    expect(drawImageOrder).toBeDefined();
    expect(captionOrder).toBeGreaterThan(drawImageOrder ?? 0);
  });

  it('applies the configured blur to gradients in export rendering', () => {
    const value = snapshot();
    value.composition.clips = [];
    value.background = {
      kind: 'gradient',
      gradient: {
        type: 'linear',
        angle: 45,
        stops: [
          { id: 'start', position: 0, color: '#000000', alpha: 1 },
          { id: 'end', position: 1, color: '#ffffff', alpha: 1 },
        ],
      },
    };
    value.blurPercent = 50;
    const ctx = context();
    const filterWrites: string[] = [];
    Object.defineProperty(ctx, 'filter', {
      configurable: true,
      get: () => filterWrites.at(-1) ?? '',
      set: (next: string) => filterWrites.push(next),
    });

    renderCompositionFrame(ctx, null, value, 0);

    expect(filterWrites).toContain('blur(24px)');
  });

  it('uses an ease-out ripple with stable 0/250/500 ms endpoints', () => {
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
          pixelX: 50,
          pixelY: 25,
          normalizedX: 0.5,
          normalizedY: 0.5,
          visible: true,
        },
        {
          event: 'button',
          sessionNs: 1_000_000,
          button: 1,
          pressed: true,
          normalizedX: 0.5,
          normalizedY: 0.5,
        },
      ],
    };
    value.cursorSettings.clickEffects.left = {
      springEnabled: false,
      springIntensity: 0,
      rippleEnabled: true,
      rippleSize: 40,
      rippleColor: '#f00',
    };
    const renderRadius = (time: number) => {
      const ctx = context();
      renderCompositionFrame(ctx, { source: {} as CanvasImageSource, width: 100, height: 50 }, value, time, null);
      return (ctx.arc as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[2] as number;
    };

    expect(renderRadius(0.001)).toBeCloseTo(2, 3);
    expect(renderRadius(0.251)).toBeGreaterThan(22);
    expect(renderRadius(0.5)).toBeCloseTo(42, 1);
  });
});
