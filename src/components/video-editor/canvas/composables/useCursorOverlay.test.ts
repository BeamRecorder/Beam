import { nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { CursorPackDescriptor } from '../../../../api/types/cursor-pack';
import { createDefaultCursorAutoHideSettings } from '../../../../api/types/cursor-settings';
import { MACOS_CURSOR_PACK } from '../../properties/cursor/cursor-packs';

const getCursorImage = vi.hoisted(() => vi.fn());
vi.mock('../../properties/cursor/useCursorReplacer', () => ({
  useCursorReplacer: () => ({ getCursorImage }),
  cursorTypeForKind: () => 'default',
}));

import { getRippleStyleColor, useCursorOverlay, type UseCursorOverlayOptions } from './useCursorOverlay';

const second = (value: number) => value * 1_000_000_000;
const effects = {
  left: {
    springEnabled: true,
    springIntensity: 80,
    rippleEnabled: true,
    rippleSize: 30,
    rippleColor: '#ff0000',
  },
  right: {
    springEnabled: false,
    springIntensity: 0,
    rippleEnabled: false,
    rippleSize: 20,
    rippleColor: '#0000ff',
  },
};

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

const createContext = () =>
  ({
    save: vi.fn(),
    restore: vi.fn(),
    measureText: vi.fn(() => ({ width: 70 })),
    roundRect: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    globalAlpha: 1,
    font: '',
    textAlign: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  }) as unknown as CanvasRenderingContext2D;

const drawOverlay = (
  overlay: ReturnType<typeof useCursorOverlay>,
  ctx = createContext(),
  drawInCameraSpace: (draw: () => void) => void = (draw) => draw(),
) => {
  overlay.updateAndDrawRipplesAndCursor(
    ctx,
    { dx: 0, dy: 0, dw: 800, dh: 450, focusX: 0, focusY: 0, scale: 1 },
    1920,
    1080,
    800,
    drawInCameraSpace,
  );
  return ctx;
};

const settleCursorImage = async () => {
  await Promise.resolve();
  await nextTick();
};

const baseOptions = (): UseCursorOverlayOptions => ({
  cursorSelection: () => ({
    packId: MACOS_CURSOR_PACK.id,
    mode: 'automatic' as const,
    cursorId: null,
  }),
  cursorPack: () => MACOS_CURSOR_PACK,
  cursorSize: () => 24,
  cursorColor: () => '#ffffff',
  enableShadow: () => true,
  clickEffects: () => effects,
  motion: () => ({
    preset: 'smooth' as const,
    smoothing: 0.67,
    springMassMultiplier: 1.29,
    motionBlur: 0.4,
  }),
  autoHide: () => createDefaultCursorAutoHideSettings(),
  shadowBlur: () => 8,
  shadowColor: () => '#000000',
  shadowDirection: () => 'bottom-right' as const,
  outputCanvas: () => ({
    preset: '16:9' as const,
    width: 1920,
    height: 1080,
    showBackground: false,
  }),
  deviceScale: () => 1,
  currentTime: () => 0.75,
  isPlaying: () => true,
  editorData: () =>
    ({
      cursor: {
        available: true,
        events: [
          {
            event: 'shape',
            sessionNs: 0,
            cursorId: 'custom:arrow',
            cursorKind: 'custom',
            hotspot: { x: 2, y: 3 },
          },
          {
            event: 'move',
            sessionNs: 0,
            pixelX: 0,
            pixelY: 0,
            normalizedX: 0.25,
            normalizedY: 0.35,
            visible: true,
          },
          {
            event: 'button',
            sessionNs: second(0.5),
            button: 1,
            pressed: true,
            normalizedX: 0.25,
            normalizedY: 0.35,
          },
        ],
      },
    }) as never,
  screenClip: () =>
    ({
      timelineStartMs: 0,
      timelineDurationMs: 10_000,
      sourceInMs: 0,
      playbackRate: 1,
      transform: { x: 0, y: 0, width: 1, height: 1 },
      isMirrored: false,
    }) as never,
  isScreenEnabled: () => true,
  showBackground: () => false,
  onRenderOnce: vi.fn(),
});

describe('useCursorOverlay', () => {
  it('formats ripple colors and loads the current cursor image', async () => {
    expect(getRippleStyleColor('#12ab34', 0.5)).toBe('rgba(18, 171, 52, 0.5)');
    expect(getRippleStyleColor('var(--cursor)', 0.5)).toBe('var(--cursor)');
    getCursorImage.mockResolvedValue({
      complete: true,
      naturalWidth: 32,
    } as HTMLImageElement);
    const options = baseOptions();
    const overlay = useCursorOverlay(options);
    drawOverlay(overlay);
    await settleCursorImage();
    expect(getCursorImage).toHaveBeenCalledWith(
      MACOS_CURSOR_PACK,
      MACOS_CURSOR_PACK.cursors.find((cursor) => cursor.id === 'default'),
      640,
      640,
      '#ffffff',
    );
    expect(options.onRenderOnce).toHaveBeenCalled();
    expect(overlay.customCursorImage.value).not.toBeNull();
  });

  it.each([
    ['single', 1, 0],
    ['double', 2, 0],
    ['solid', 2, 1],
    ['none', 0, 0],
  ] as const)('draws the %s global ripple shape in playback', async (style, expectedRings, expectedFilledRings) => {
    getCursorImage.mockClear().mockResolvedValue({
      complete: true,
      naturalWidth: 32,
    } as HTMLImageElement);
    const options = baseOptions();
    options.clickEffects = () => ({
      left: {
        ...effects.left,
        rippleEnabled: style !== 'none',
        rippleStyle: style,
      },
      right: { ...effects.right, rippleEnabled: false, rippleStyle: 'none' },
    });
    const overlay = useCursorOverlay(options);
    drawOverlay(overlay);
    await settleCursorImage();

    const ctx = createContext();
    drawOverlay(overlay, ctx);

    expect(ctx.arc).toHaveBeenCalledTimes(expectedRings);
    expect(ctx.fill).toHaveBeenCalledTimes(expectedFilledRings);
    expect(ctx.stroke).toHaveBeenCalledTimes(expectedRings - expectedFilledRings);
  });

  it.each([
    ['entry', 1, 0.5],
    ['entry', 5, 1 - 0.5 ** 5],
    ['exit', 1, 0.5],
    ['exit', 5, 0.5 ** 5],
  ] as const)(
    'multiplies playback cursor and ripple alpha by the %s easing curve (power %s)',
    async (edge, power, expectedAlpha) => {
      getCursorImage.mockClear().mockResolvedValue({
        complete: true,
        naturalWidth: 32,
      } as HTMLImageElement);
      const options = baseOptions();
      options.currentTime = () => 0.5;
      options.motion = () => ({
        preset: 'smooth',
        smoothing: 0.67,
        springMassMultiplier: 1.29,
        motionBlur: 0,
      });
      options.editorData = () =>
        ({
          cursor: {
            available: true,
            events: [
              {
                event: 'shape',
                sessionNs: 0,
                cursorId: 'custom:arrow',
                cursorKind: 'custom',
                hotspot: { x: 2, y: 3 },
              },
              {
                event: 'move',
                sessionNs: 0,
                pixelX: 0,
                pixelY: 0,
                normalizedX: 0.25,
                normalizedY: 0.35,
                visible: true,
              },
              {
                event: 'button',
                sessionNs: second(0.25),
                button: 1,
                pressed: true,
                normalizedX: 0.25,
                normalizedY: 0.35,
              },
            ],
          },
        }) as never;
      options.screenClip = () =>
        ({
          timelineStartMs: 0,
          timelineDurationMs: 1_000,
          sourceInMs: 0,
          sourceDurationMs: 1_000,
          playbackRate: 1,
          transform: { x: 0, y: 0, width: 1, height: 1 },
          isMirrored: false,
          transitions:
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
                },
        }) as never;
      const overlay = useCursorOverlay(options);
      drawOverlay(overlay);
      await settleCursorImage();

      const ctx = createContext();
      const rippleAlphas: number[] = [];
      const cursorAlphas: number[] = [];
      (ctx.arc as ReturnType<typeof vi.fn>).mockImplementation(() => rippleAlphas.push(ctx.globalAlpha));
      (ctx.drawImage as ReturnType<typeof vi.fn>).mockImplementation(() => cursorAlphas.push(ctx.globalAlpha));
      drawOverlay(overlay, ctx);

      expect(rippleAlphas.length).toBeGreaterThan(0);
      expect(cursorAlphas).toEqual([expect.closeTo(expectedAlpha, 8)]);
      expect(rippleAlphas).toEqual(rippleAlphas.map(() => expect.closeTo(expectedAlpha, 8)));
    },
  );

  it.each([
    ['no active screen', null, true],
    ['disabled screen', 'screen', false],
  ] as const)('does not draw playback cursor/ripples with %s', (_, screen, enabled) => {
    const options = baseOptions();
    options.screenClip = () =>
      screen
        ? ({
            timelineStartMs: 0,
            timelineDurationMs: 1_000,
            sourceInMs: 0,
            sourceDurationMs: 1_000,
            playbackRate: 1,
            transform: { x: 0, y: 0, width: 1, height: 1 },
            isMirrored: false,
          } as never)
        : null;
    options.isScreenEnabled = () => enabled;
    const overlay = useCursorOverlay(options);
    const ctx = createContext();

    overlay.updateAndDrawRipplesAndCursor(
      ctx,
      { dx: 0, dy: 0, dw: 800, dh: 450, focusX: 0, focusY: 0, scale: 1 },
      1920,
      1080,
      800,
      (draw) => draw(),
    );

    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(overlay.cursorBounds.value).toBeNull();
  });

  it('stops drawing and clears bounds after auto-hide idle time, then resumes after a real movement', async () => {
    getCursorImage.mockClear().mockResolvedValue({
      complete: true,
      naturalWidth: 32,
    } as HTMLImageElement);
    const time = ref(0.2);
    const options = baseOptions();
    options.currentTime = () => time.value;
    options.autoHide = () => ({ enabled: true, delaySeconds: 0.5, fadeDurationMs: 0 });
    options.editorData = () =>
      ({
        cursor: {
          available: true,
          events: [
            {
              event: 'shape',
              sessionNs: 0,
              cursorId: 'custom:arrow',
              cursorKind: 'custom',
              hotspot: { x: 2, y: 3 },
            },
            {
              event: 'move',
              sessionNs: 0,
              pixelX: 0,
              pixelY: 0,
              normalizedX: 0.25,
              normalizedY: 0.35,
              visible: true,
            },
            {
              event: 'move',
              sessionNs: second(1),
              pixelX: 0,
              pixelY: 0,
              normalizedX: 0.75,
              normalizedY: 0.65,
              visible: true,
            },
          ],
        },
      }) as never;
    const overlay = useCursorOverlay(options);

    drawOverlay(overlay);
    await settleCursorImage();
    const visibleContext = createContext();
    drawOverlay(overlay, visibleContext);
    expect(visibleContext.drawImage).toHaveBeenCalled();
    expect(overlay.cursorBounds.value).not.toBeNull();

    time.value = 0.75;
    const idleContext = createContext();
    drawOverlay(overlay, idleContext);
    expect(idleContext.drawImage).not.toHaveBeenCalled();
    expect(overlay.cursorBounds.value).toBeNull();

    time.value = 1.2;
    const resumedContext = createContext();
    drawOverlay(overlay, resumedContext);
    expect(resumedContext.drawImage).toHaveBeenCalled();
    expect(overlay.cursorBounds.value).not.toBeNull();
  });

  it('fades the preview cursor while retaining its bounds until the fade completes', async () => {
    getCursorImage.mockClear().mockResolvedValue({
      complete: true,
      naturalWidth: 32,
    } as HTMLImageElement);
    const time = ref(0.5);
    const options = baseOptions();
    options.currentTime = () => time.value;
    options.motion = () => ({
      preset: 'smooth',
      smoothing: 0.67,
      springMassMultiplier: 1.29,
      motionBlur: 0,
    });
    options.autoHide = () => ({ enabled: true, delaySeconds: 0.5, fadeDurationMs: 1_000 });
    const overlay = useCursorOverlay(options);

    drawOverlay(overlay);
    await settleCursorImage();

    const fullyVisibleContext = createContext();
    const fullyVisibleAlphas: number[] = [];
    (fullyVisibleContext.drawImage as ReturnType<typeof vi.fn>).mockImplementation(() =>
      fullyVisibleAlphas.push(fullyVisibleContext.globalAlpha),
    );
    drawOverlay(overlay, fullyVisibleContext);
    expect(fullyVisibleAlphas).toEqual([1]);

    time.value = 1.5;
    const halfVisibleContext = createContext();
    const halfVisibleAlphas: number[] = [];
    (halfVisibleContext.drawImage as ReturnType<typeof vi.fn>).mockImplementation(() =>
      halfVisibleAlphas.push(halfVisibleContext.globalAlpha),
    );
    drawOverlay(overlay, halfVisibleContext);
    expect(halfVisibleAlphas).toEqual([expect.closeTo(0.5, 8)]);
    expect(overlay.cursorBounds.value).not.toBeNull();

    time.value = 2;
    const hiddenContext = createContext();
    drawOverlay(overlay, hiddenContext);
    expect(hiddenContext.drawImage).not.toHaveBeenCalled();
    expect(overlay.cursorBounds.value).toBeNull();
  });

  it('fades the preview cursor back in after a complete hide and resumes instantly with a zero fade', async () => {
    getCursorImage.mockClear().mockResolvedValue({
      complete: true,
      naturalWidth: 32,
    } as HTMLImageElement);
    const time = ref(0);
    const fadeDurationMs = ref(1_000);
    const options = baseOptions();
    options.currentTime = () => time.value;
    options.motion = () => ({
      preset: 'smooth',
      smoothing: 0.67,
      springMassMultiplier: 1.29,
      motionBlur: 0,
    });
    options.autoHide = () => ({ enabled: true, delaySeconds: 1, fadeDurationMs: fadeDurationMs.value });
    options.editorData = () =>
      ({
        cursor: {
          available: true,
          events: [
            {
              event: 'move',
              sessionNs: 0,
              pixelX: 0,
              pixelY: 0,
              normalizedX: 0.25,
              normalizedY: 0.35,
              visible: true,
            },
            {
              event: 'move',
              sessionNs: second(3),
              pixelX: 0,
              pixelY: 0,
              normalizedX: 0.75,
              normalizedY: 0.65,
              visible: true,
            },
          ],
        },
      }) as never;
    const overlay = useCursorOverlay(options);

    drawOverlay(overlay);
    await settleCursorImage();

    const drawAlphaAt = (nextTime: number) => {
      time.value = nextTime;
      const ctx = createContext();
      const alphas: number[] = [];
      (ctx.drawImage as ReturnType<typeof vi.fn>).mockImplementation(() => alphas.push(ctx.globalAlpha));
      drawOverlay(overlay, ctx);
      return { ctx, alphas };
    };

    expect(drawAlphaAt(0).alphas).toEqual([1]);
    expect(drawAlphaAt(2).ctx.drawImage).not.toHaveBeenCalled();
    expect(drawAlphaAt(3.25).alphas).toEqual([expect.closeTo(0.25, 8)]);
    expect(drawAlphaAt(3.5).alphas).toEqual([expect.closeTo(0.5, 8)]);
    expect(drawAlphaAt(4).alphas).toEqual([1]);

    fadeDurationMs.value = 0;
    expect(drawAlphaAt(3.25).alphas).toEqual([1]);
  });

  it('does not fade in activity that interrupts the fade-out before the cursor is fully hidden', async () => {
    getCursorImage.mockClear().mockResolvedValue({
      complete: true,
      naturalWidth: 32,
    } as HTMLImageElement);
    const time = ref(0);
    const options = baseOptions();
    options.currentTime = () => time.value;
    options.motion = () => ({
      preset: 'smooth',
      smoothing: 0.67,
      springMassMultiplier: 1.29,
      motionBlur: 0,
    });
    options.autoHide = () => ({ enabled: true, delaySeconds: 1, fadeDurationMs: 1_000 });
    options.editorData = () =>
      ({
        cursor: {
          available: true,
          events: [
            {
              event: 'move',
              sessionNs: 0,
              pixelX: 0,
              pixelY: 0,
              normalizedX: 0.25,
              normalizedY: 0.35,
              visible: true,
            },
            {
              event: 'move',
              sessionNs: second(1.5),
              pixelX: 0,
              pixelY: 0,
              normalizedX: 0.75,
              normalizedY: 0.65,
              visible: true,
            },
          ],
        },
      }) as never;
    const overlay = useCursorOverlay(options);
    drawOverlay(overlay);
    await settleCursorImage();

    const drawAlphaAt = (nextTime: number) => {
      time.value = nextTime;
      const ctx = createContext();
      const alphas: number[] = [];
      (ctx.drawImage as ReturnType<typeof vi.fn>).mockImplementation(() => alphas.push(ctx.globalAlpha));
      drawOverlay(overlay, ctx);
      return alphas;
    };

    expect(drawAlphaAt(1.25)).toEqual([expect.closeTo(0.75, 8)]);
    expect(drawAlphaAt(1.5)).toEqual([1]);
  });

  it('keeps the loaded image while cursor size changes, then updates bounds on the next draw', async () => {
    getCursorImage.mockClear();
    const image = { complete: true, naturalWidth: 32 } as HTMLImageElement;
    getCursorImage.mockResolvedValue(image);
    const cursorSize = ref(24);
    const options = baseOptions();
    options.cursorSize = () => cursorSize.value;
    const overlay = useCursorOverlay(options);
    drawOverlay(overlay);
    await settleCursorImage();

    const draw = () =>
      overlay.updateAndDrawRipplesAndCursor(
        createContext(),
        { dx: 0, dy: 0, dw: 800, dh: 450, focusX: 0, focusY: 0, scale: 1 },
        1920,
        1080,
        800,
        (drawContent) => drawContent(),
      );
    draw();
    await settleCursorImage();
    draw();
    const firstBounds = overlay.cursorBounds.value;
    expect(firstBounds).not.toBeNull();
    expect(overlay.customCursorImage.value).toMatchObject({
      complete: true,
      naturalWidth: 32,
    });
    expect(getCursorImage).toHaveBeenCalledOnce();

    cursorSize.value = 48;
    await nextTick();
    expect(overlay.customCursorImage.value).toMatchObject({
      complete: true,
      naturalWidth: 32,
    });
    expect(getCursorImage).toHaveBeenCalledOnce();

    draw();
    expect(overlay.cursorBounds.value?.width).toBeGreaterThan(firstBounds!.width);
    expect(overlay.cursorBounds.value?.height).toBeGreaterThan(firstBounds!.height);
  });

  it('draws a Beam fallback for custom cursors without a canvas warning', async () => {
    getCursorImage.mockClear();
    getCursorImage.mockResolvedValue({
      complete: true,
      naturalWidth: 32,
    } as HTMLImageElement);
    const options = baseOptions();
    const overlay = useCursorOverlay(options);
    drawOverlay(overlay);
    await settleCursorImage();
    expect(getCursorImage).toHaveBeenLastCalledWith(
      MACOS_CURSOR_PACK,
      MACOS_CURSOR_PACK.cursors.find((cursor) => cursor.id === 'default'),
      640,
      640,
      '#ffffff',
    );
    const ctx = createContext();
    const drawContent = vi.fn((draw: () => void) => draw());
    drawOverlay(overlay, ctx, drawContent);
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(ctx.shadowColor).toBe('#000000');
    expect(ctx.drawImage).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.any(Number),
      expect.any(Number),
      expect.closeTo(10, 0.01),
      expect.closeTo(10, 0.01),
    );
    expect(ctx.fillText).not.toHaveBeenCalledWith('System cursor not translated', expect.any(Number), 29);
    expect(drawContent).toHaveBeenCalledOnce();
  });

  it('warns when cursor data is unavailable without retaining mutable ripple state', () => {
    const options = baseOptions();
    options.editorData = () => ({ cursor: { available: false, events: [] } }) as never;
    const overlay = useCursorOverlay(options);
    const ctx = createContext();
    overlay.updateAndDrawRipplesAndCursor(
      ctx,
      { dx: 0, dy: 0, dw: 800, dh: 450, focusX: 0, focusY: 0, scale: 1 },
      1920,
      1080,
      800,
      vi.fn(),
    );
    expect(ctx.fillText).toHaveBeenCalledWith('Cursor data missing', expect.any(Number), 29);
    options.editorData = () => ({ cursor: { available: true, events: [] } }) as never;
    overlay.updateAndDrawRipplesAndCursor(
      ctx,
      { dx: 0, dy: 0, dw: 800, dh: 450, focusX: 0, focusY: 0, scale: 1 },
      1920,
      1080,
      800,
      vi.fn(),
    );
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it('clears stale canvas bounds when the cursor becomes unavailable or hidden', async () => {
    getCursorImage.mockResolvedValue({
      complete: true,
      naturalWidth: 32,
    } as HTMLImageElement);
    const options = baseOptions();
    const overlay = useCursorOverlay(options);
    drawOverlay(overlay);
    await settleCursorImage();

    const draw = (data: ReturnType<UseCursorOverlayOptions['editorData']>) => {
      options.editorData = () => data;
      overlay.updateAndDrawRipplesAndCursor(
        createContext(),
        { dx: 0, dy: 0, dw: 800, dh: 450, focusX: 0, focusY: 0, scale: 1 },
        1920,
        1080,
        800,
        (drawContent) => drawContent(),
      );
    };

    draw(options.editorData());
    expect(overlay.cursorBounds.value).toEqual(
      expect.objectContaining({
        width: expect.any(Number),
        height: expect.any(Number),
      }),
    );

    draw({ cursor: { available: false, events: [] } } as never);
    expect(overlay.cursorBounds.value).toBeNull();

    draw({
      cursor: {
        available: true,
        events: [
          {
            event: 'shape',
            sessionNs: 0,
            cursorId: 'custom:arrow',
            cursorKind: 'custom',
            hotspot: { x: 2, y: 3 },
          },
          {
            event: 'move',
            sessionNs: 0,
            pixelX: 0,
            pixelY: 0,
            normalizedX: 0.25,
            normalizedY: 0.35,
            visible: false,
          },
        ],
      },
    } as never);
    expect(overlay.cursorBounds.value).toBeNull();
  });

  it('clears the image when the cursor replacement fails', async () => {
    getCursorImage.mockRejectedValue(new Error('cursor unavailable'));
    const options = baseOptions();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const overlay = useCursorOverlay(options);
    drawOverlay(overlay);
    await settleCursorImage();
    expect(overlay.customCursorImage.value).toBeNull();
    expect(error).toHaveBeenCalledWith('Failed to load custom cursor image.');
    error.mockRestore();
  });

  it('warns while rendering a temporary macOS fallback for a missing pack', async () => {
    getCursorImage.mockResolvedValue({
      complete: true,
      naturalWidth: 32,
    } as HTMLImageElement);
    const options = baseOptions();
    options.cursorPack = () => null;
    const overlay = useCursorOverlay(options);
    drawOverlay(overlay);
    await settleCursorImage();

    const ctx = createContext();
    drawOverlay(overlay, ctx);

    expect(ctx.fillText).toHaveBeenCalledWith('Cursor pack unavailable — import it again', expect.any(Number), 29);
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it('preserves a non-square asset ratio and hotspot in the canvas preview', async () => {
    const pack = wideCursorPack();
    getCursorImage.mockResolvedValue({
      complete: true,
      naturalWidth: 40,
    } as HTMLImageElement);
    const options = baseOptions();
    options.cursorPack = () => pack;
    options.cursorSelection = () => ({
      packId: pack.id,
      mode: 'fixed' as const,
      cursorId: 'wide-default',
    });
    const overlay = useCursorOverlay(options);
    drawOverlay(overlay);
    await settleCursorImage();
    const image = overlay.customCursorImage.value;
    expect(getCursorImage).toHaveBeenLastCalledWith(pack, pack.cursors[0], 1280, 640, '#ffffff');
    expect(image).not.toBeNull();

    const ctx = createContext();
    drawOverlay(overlay, ctx);

    expect(ctx.drawImage).toHaveBeenCalledWith(
      image,
      expect.closeTo(-2.5, 0.001),
      expect.closeTo(-2, 0.001),
      expect.closeTo(20, 0.001),
      expect.closeTo(10, 0.001),
    );
  });

  it('reloads the selected pack when it becomes available without a time or selection change', async () => {
    getCursorImage.mockResolvedValue({
      complete: true,
      naturalWidth: 32,
    } as HTMLImageElement);
    const pack = wideCursorPack();
    const selectedPack = ref<CursorPackDescriptor | null>(null);
    const selection = ref({
      packId: pack.id,
      mode: 'automatic' as const,
      cursorId: null,
    });
    const options = baseOptions();
    options.cursorPack = () => selectedPack.value;
    options.cursorSelection = () => selection.value;
    const overlay = useCursorOverlay(options);

    drawOverlay(overlay);
    await settleCursorImage();
    getCursorImage.mockClear();
    const time = options.currentTime();
    const unchangedSelection = { ...selection.value };

    selectedPack.value = pack;
    drawOverlay(overlay);
    await settleCursorImage();

    expect(options.currentTime()).toBe(time);
    expect(selection.value).toEqual(unchangedSelection);
    expect(getCursorImage).toHaveBeenCalledWith(pack, pack.cursors[0], 1280, 640, '#ffffff');
    expect(overlay.customCursorImage.value).not.toBeNull();
    expect(options.onRenderOnce).toHaveBeenCalled();
  });

  it('keeps the newest cursor image when an older image request resolves later', async () => {
    getCursorImage.mockClear();
    const firstPack = wideCursorPack();
    const secondPack = { ...wideCursorPack(), id: 'imported:newer' };
    const firstImage = {
      id: 'first',
      complete: true,
      naturalWidth: 32,
    } as HTMLImageElement;
    const secondImage = {
      id: 'second',
      complete: true,
      naturalWidth: 32,
    } as HTMLImageElement;
    let resolveFirst: ((image: HTMLImageElement) => void) | undefined;
    let resolveSecond: ((image: HTMLImageElement) => void) | undefined;
    getCursorImage.mockImplementation((pack: CursorPackDescriptor) => {
      if (pack.id === firstPack.id)
        return new Promise<HTMLImageElement>((resolve) => {
          resolveFirst = resolve;
        });
      return new Promise<HTMLImageElement>((resolve) => {
        resolveSecond = resolve;
      });
    });
    const selectedPack = ref<CursorPackDescriptor | null>(firstPack);
    const selection = ref({
      packId: firstPack.id,
      mode: 'automatic' as const,
      cursorId: null,
    });
    const options = baseOptions();
    options.cursorPack = () => selectedPack.value;
    options.cursorSelection = () => selection.value;
    const overlay = useCursorOverlay(options);

    drawOverlay(overlay);
    await settleCursorImage();
    expect(resolveFirst).toBeTypeOf('function');

    selectedPack.value = secondPack;
    selection.value = {
      packId: secondPack.id,
      mode: 'automatic',
      cursorId: null,
    };
    drawOverlay(overlay);
    expect(resolveSecond).toBeTypeOf('function');
    expect(getCursorImage).toHaveBeenCalledTimes(2);

    resolveSecond?.(secondImage);
    await Promise.resolve();
    await Promise.resolve();
    await nextTick();
    expect(overlay.customCursorImage.value).toMatchObject({ id: 'second' });

    resolveFirst?.(firstImage);
    await Promise.resolve();
    await Promise.resolve();
    await nextTick();
    expect(overlay.customCursorImage.value).toMatchObject({ id: 'second' });
  });

  it('keeps the image across time changes for one asset and reloads once when cursorId changes', async () => {
    const image = {
      id: 'stable',
      complete: true,
      naturalWidth: 32,
    } as HTMLImageElement;
    getCursorImage.mockClear().mockResolvedValue(image);
    const time = ref(0.25);
    const selection = ref({
      packId: MACOS_CURSOR_PACK.id,
      mode: 'fixed' as const,
      cursorId: 'default',
    });
    const options = baseOptions();
    options.currentTime = () => time.value;
    options.cursorSelection = () => selection.value;
    options.editorData = () =>
      ({
        cursor: {
          available: true,
          events: [
            {
              event: 'shape',
              sessionNs: 0,
              cursorId: 'default',
              cursorKind: 'default',
              hotspot: { x: 10, y: 7 },
            },
            {
              event: 'move',
              sessionNs: 0,
              pixelX: 0,
              pixelY: 0,
              normalizedX: 0.25,
              normalizedY: 0.35,
              visible: true,
            },
          ],
        },
      }) as never;
    const overlay = useCursorOverlay(options);

    drawOverlay(overlay);
    await settleCursorImage();
    expect(getCursorImage).toHaveBeenCalledOnce();
    const firstImage = overlay.customCursorImage.value;
    expect(firstImage).toMatchObject({ id: 'stable' });

    getCursorImage.mockClear();
    time.value = 0.75;
    drawOverlay(overlay);
    await settleCursorImage();
    expect(getCursorImage).not.toHaveBeenCalled();
    expect(overlay.customCursorImage.value).toBe(firstImage);

    selection.value = {
      packId: MACOS_CURSOR_PACK.id,
      mode: 'fixed',
      cursorId: 'handpointing',
    };
    drawOverlay(overlay);
    await settleCursorImage();
    expect(getCursorImage).toHaveBeenCalledOnce();
    expect(getCursorImage).toHaveBeenLastCalledWith(
      MACOS_CURSOR_PACK,
      MACOS_CURSOR_PACK.cursors.find((cursor) => cursor.id === 'handpointing'),
      640,
      640,
      '#ffffff',
    );
    expect(overlay.customCursorImage.value).toMatchObject({ id: 'stable' });
  });

  it('does not reload the cursor image for repeated playback draws until the asset key changes', async () => {
    const image = {
      id: 'cached',
      complete: true,
      naturalWidth: 32,
    } as HTMLImageElement;
    getCursorImage.mockClear().mockResolvedValue(image);
    const time = ref(0);
    const selection = ref({
      packId: MACOS_CURSOR_PACK.id,
      mode: 'fixed' as const,
      cursorId: 'default',
    });
    const options = baseOptions();
    options.currentTime = () => time.value;
    options.cursorSelection = () => selection.value;
    const overlay = useCursorOverlay(options);

    const drawAt = async (nextTime: number) => {
      time.value = nextTime;
      drawOverlay(overlay);
      await settleCursorImage();
    };

    await drawAt(0);
    expect(getCursorImage).toHaveBeenCalledOnce();
    getCursorImage.mockClear();

    await drawAt(0.25);
    await drawAt(0.5);
    await drawAt(0.75);
    expect(getCursorImage).not.toHaveBeenCalled();
    expect(overlay.customCursorImage.value).toMatchObject(image);

    selection.value = {
      packId: MACOS_CURSOR_PACK.id,
      mode: 'fixed',
      cursorId: 'handpointing',
    };
    await drawAt(1);
    expect(getCursorImage).toHaveBeenCalledOnce();
    expect(getCursorImage).toHaveBeenLastCalledWith(
      MACOS_CURSOR_PACK,
      MACOS_CURSOR_PACK.cursors.find((cursor) => cursor.id === 'handpointing'),
      640,
      640,
      '#ffffff',
    );
  });
});
