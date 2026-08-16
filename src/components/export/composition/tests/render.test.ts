import { describe, expect, it, vi } from 'vitest';
import { drawCompositionLayers, renderCompositionFrame, type RenderableMedia } from '../render';
import type { CompositionSnapshot } from '../../export-types';
import { DEFAULT_OUTPUT_CANVAS } from '../../../video-editor/canvas/output-canvas';
import type { ClipComposition, ClipAppearance } from '~/media/shared/composition-types';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';

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
    selectedCursor: 'automatic',
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

describe('canonical composition rendering', () => {
  it('paints the fallback canvas when the screen clip has no available frame', () => {
    const ctx = context();
    renderCompositionFrame(ctx, null, snapshot(), 0);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 50);
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
    const image = { source: {} as CanvasImageSource, width: 10, height: 10 } as RenderableMedia;
    const ctx = context();
    drawCompositionLayers(ctx, value, 0.2, new Map([['logo', image]]));
    expect(ctx.drawImage).toHaveBeenCalledWith(image.source, 10, 10, 30, 20);
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
    const source = { source: {} as CanvasImageSource, width: 100, height: 50 } as RenderableMedia;
    const ctx = context();
    renderCompositionFrame(
      ctx,
      { source: {} as CanvasImageSource, width: 100, height: 50 } as RenderableMedia,
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
    const source = { source: {} as CanvasImageSource, width: 100, height: 50 } as RenderableMedia;
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
        sentences: [{ id: 's', text: 'One two three four', startMs: 0, endMs: 1_000, words: [] }],
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
        sentences: [{ id: 's', text: 'One two three four', startMs: 0, endMs: 1_000, words: [] }],
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
      const cursorImage = { complete: true, naturalWidth: 24 } as HTMLImageElement;
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
      { source: {} as CanvasImageSource, width: 100, height: 50 } as RenderableMedia,
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
      { source: {} as CanvasImageSource, width: 100, height: 50 } as RenderableMedia,
      value,
      0,
      null,
      new Map([['default', image]]),
    );

    expect(ctx.drawImage).toHaveBeenLastCalledWith(image, expect.any(Number), expect.any(Number), 50, 50);
  });
});
