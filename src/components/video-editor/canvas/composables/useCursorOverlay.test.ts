import { nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { CursorPackDescriptor } from '../../../../api/types/cursor-pack';
import { MACOS_CURSOR_PACK } from '../../properties/cursor/cursor-packs';

const getCursorImage = vi.hoisted(() => vi.fn());
vi.mock('../../properties/cursor/useCursorReplacer', () => ({
  useCursorReplacer: () => ({ getCursorImage }),
  cursorTypeForKind: () => 'default',
}));

import { getRippleStyleColor, useCursorOverlay, type UseCursorOverlayOptions } from './useCursorOverlay';

const second = (value: number) => value * 1_000_000_000;
const effects = {
  left: { springEnabled: true, springIntensity: 80, rippleEnabled: true, rippleSize: 30, rippleColor: '#ff0000' },
  right: { springEnabled: false, springIntensity: 0, rippleEnabled: false, rippleSize: 20, rippleColor: '#0000ff' },
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

const baseOptions = (): UseCursorOverlayOptions => ({
  cursorSelection: () => ({ packId: MACOS_CURSOR_PACK.id, mode: 'automatic' as const, cursorId: null }),
  cursorPack: () => MACOS_CURSOR_PACK,
  cursorSize: () => 24,
  cursorColor: () => '#ffffff',
  enableShadow: () => true,
  clickEffects: () => effects,
  motion: () => ({ preset: 'smooth' as const, smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 }),
  shadowBlur: () => 8,
  shadowColor: () => '#000000',
  shadowDirection: () => 'bottom-right' as const,
  outputCanvas: () => ({ preset: '16:9' as const, width: 1920, height: 1080, showBackground: false }),
  deviceScale: () => 1,
  currentTime: () => 0.75,
  isPlaying: () => true,
  editorData: () =>
    ({
      cursor: {
        available: true,
        events: [
          { event: 'shape', sessionNs: 0, cursorId: 'custom:arrow', cursorKind: 'custom', hotspot: { x: 2, y: 3 } },
          { event: 'move', sessionNs: 0, pixelX: 0, pixelY: 0, normalizedX: 0.25, normalizedY: 0.35, visible: true },
          { event: 'button', sessionNs: second(0.5), button: 1, pressed: true, normalizedX: 0.25, normalizedY: 0.35 },
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
    getCursorImage.mockResolvedValue({ complete: true, naturalWidth: 32 } as HTMLImageElement);
    const options = baseOptions();
    const overlay = useCursorOverlay(options);
    await nextTick();
    await Promise.resolve();
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
    getCursorImage.mockClear().mockResolvedValue({ complete: true, naturalWidth: 32 } as HTMLImageElement);
    const options = baseOptions();
    options.clickEffects = () => ({
      left: { ...effects.left, rippleEnabled: style !== 'none', rippleStyle: style },
      right: { ...effects.right, rippleEnabled: false, rippleStyle: 'none' },
    });
    const overlay = useCursorOverlay(options);
    await nextTick();
    await Promise.resolve();

    const ctx = createContext();
    overlay.updateAndDrawRipplesAndCursor(
      ctx,
      { dx: 0, dy: 0, dw: 800, dh: 450, focusX: 0, focusY: 0, scale: 1 },
      1920,
      1080,
      800,
      (draw) => draw(),
    );

    expect(ctx.arc).toHaveBeenCalledTimes(expectedRings);
    expect(ctx.fill).toHaveBeenCalledTimes(expectedFilledRings);
    expect(ctx.stroke).toHaveBeenCalledTimes(expectedRings - expectedFilledRings);
  });

  it('keeps the loaded image while cursor size changes, then updates bounds on the next draw', async () => {
    getCursorImage.mockClear();
    const image = { complete: true, naturalWidth: 32 } as HTMLImageElement;
    getCursorImage.mockResolvedValue(image);
    const cursorSize = ref(24);
    const options = baseOptions();
    options.cursorSize = () => cursorSize.value;
    const overlay = useCursorOverlay(options);
    await nextTick();
    await Promise.resolve();

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
    const firstBounds = overlay.cursorBounds.value;
    expect(firstBounds).not.toBeNull();
    expect(overlay.customCursorImage.value).toMatchObject({ complete: true, naturalWidth: 32 });
    expect(getCursorImage).toHaveBeenCalledOnce();

    cursorSize.value = 48;
    await nextTick();
    expect(overlay.customCursorImage.value).toMatchObject({ complete: true, naturalWidth: 32 });
    expect(getCursorImage).toHaveBeenCalledOnce();

    draw();
    expect(overlay.cursorBounds.value?.width).toBeGreaterThan(firstBounds!.width);
    expect(overlay.cursorBounds.value?.height).toBeGreaterThan(firstBounds!.height);
  });

  it('draws a Beam fallback for custom cursors without a canvas warning', async () => {
    getCursorImage.mockClear();
    getCursorImage.mockResolvedValue({ complete: true, naturalWidth: 32 } as HTMLImageElement);
    const options = baseOptions();
    const overlay = useCursorOverlay(options);
    await nextTick();
    await Promise.resolve();
    expect(getCursorImage).toHaveBeenLastCalledWith(
      MACOS_CURSOR_PACK,
      MACOS_CURSOR_PACK.cursors.find((cursor) => cursor.id === 'default'),
      640,
      640,
      '#ffffff',
    );
    const ctx = createContext();
    const drawContent = vi.fn((draw: () => void) => draw());
    overlay.updateAndDrawRipplesAndCursor(
      ctx,
      { dx: 0, dy: 0, dw: 800, dh: 450, focusX: 0, focusY: 0, scale: 1 },
      1920,
      1080,
      800,
      drawContent,
    );
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
    getCursorImage.mockResolvedValue({ complete: true, naturalWidth: 32 } as HTMLImageElement);
    const options = baseOptions();
    const overlay = useCursorOverlay(options);
    await nextTick();
    await Promise.resolve();

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
      expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
    );

    draw({ cursor: { available: false, events: [] } } as never);
    expect(overlay.cursorBounds.value).toBeNull();

    draw({
      cursor: {
        available: true,
        events: [
          { event: 'shape', sessionNs: 0, cursorId: 'custom:arrow', cursorKind: 'custom', hotspot: { x: 2, y: 3 } },
          { event: 'move', sessionNs: 0, pixelX: 0, pixelY: 0, normalizedX: 0.25, normalizedY: 0.35, visible: false },
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
    await nextTick();
    await Promise.resolve();
    expect(overlay.customCursorImage.value).toBeNull();
    expect(error).toHaveBeenCalledWith('Failed to load custom cursor image.');
    error.mockRestore();
  });

  it('warns while rendering a temporary macOS fallback for a missing pack', async () => {
    getCursorImage.mockResolvedValue({ complete: true, naturalWidth: 32 } as HTMLImageElement);
    const options = baseOptions();
    options.cursorPack = () => null;
    const overlay = useCursorOverlay(options);
    await nextTick();
    await Promise.resolve();

    const ctx = createContext();
    overlay.updateAndDrawRipplesAndCursor(
      ctx,
      { dx: 0, dy: 0, dw: 800, dh: 450, focusX: 0, focusY: 0, scale: 1 },
      1920,
      1080,
      800,
      (draw) => draw(),
    );

    expect(ctx.fillText).toHaveBeenCalledWith('Cursor pack unavailable — import it again', expect.any(Number), 29);
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it('preserves a non-square asset ratio and hotspot in the canvas preview', async () => {
    const pack = wideCursorPack();
    getCursorImage.mockResolvedValue({ complete: true, naturalWidth: 40 } as HTMLImageElement);
    const options = baseOptions();
    options.cursorPack = () => pack;
    options.cursorSelection = () => ({ packId: pack.id, mode: 'fixed' as const, cursorId: 'wide-default' });
    const overlay = useCursorOverlay(options);
    await nextTick();
    await Promise.resolve();
    const image = overlay.customCursorImage.value;
    expect(getCursorImage).toHaveBeenLastCalledWith(pack, pack.cursors[0], 1280, 640, '#ffffff');
    expect(image).not.toBeNull();

    const ctx = createContext();
    overlay.updateAndDrawRipplesAndCursor(
      ctx,
      { dx: 0, dy: 0, dw: 800, dh: 450, focusX: 0, focusY: 0, scale: 1 },
      1920,
      1080,
      800,
      (draw) => draw(),
    );

    expect(ctx.drawImage).toHaveBeenCalledWith(
      image,
      expect.closeTo(-2.5, 0.001),
      expect.closeTo(-2, 0.001),
      expect.closeTo(20, 0.001),
      expect.closeTo(10, 0.001),
    );
  });

  it('reloads the selected pack when it becomes available without a time or selection change', async () => {
    getCursorImage.mockResolvedValue({ complete: true, naturalWidth: 32 } as HTMLImageElement);
    const pack = wideCursorPack();
    const selectedPack = ref<CursorPackDescriptor | null>(null);
    const selection = ref({ packId: pack.id, mode: 'automatic' as const, cursorId: null });
    const options = baseOptions();
    options.cursorPack = () => selectedPack.value;
    options.cursorSelection = () => selection.value;
    const overlay = useCursorOverlay(options);

    await nextTick();
    await Promise.resolve();
    getCursorImage.mockClear();
    const time = options.currentTime();
    const unchangedSelection = { ...selection.value };

    selectedPack.value = pack;
    await nextTick();
    await Promise.resolve();

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
    const firstImage = { id: 'first', complete: true, naturalWidth: 32 } as HTMLImageElement;
    const secondImage = { id: 'second', complete: true, naturalWidth: 32 } as HTMLImageElement;
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
    const selection = ref({ packId: firstPack.id, mode: 'automatic' as const, cursorId: null });
    const options = baseOptions();
    options.cursorPack = () => selectedPack.value;
    options.cursorSelection = () => selection.value;
    const overlay = useCursorOverlay(options);

    await nextTick();
    expect(resolveFirst).toBeTypeOf('function');

    selectedPack.value = secondPack;
    selection.value = { packId: secondPack.id, mode: 'automatic', cursorId: null };
    await nextTick();
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
    const image = { id: 'stable', complete: true, naturalWidth: 32 } as HTMLImageElement;
    getCursorImage.mockClear().mockResolvedValue(image);
    const time = ref(0.25);
    const selection = ref({ packId: MACOS_CURSOR_PACK.id, mode: 'fixed' as const, cursorId: 'default' });
    const options = baseOptions();
    options.currentTime = () => time.value;
    options.cursorSelection = () => selection.value;
    options.editorData = () =>
      ({
        cursor: {
          available: true,
          events: [
            { event: 'shape', sessionNs: 0, cursorId: 'default', cursorKind: 'default', hotspot: { x: 10, y: 7 } },
            { event: 'move', sessionNs: 0, pixelX: 0, pixelY: 0, normalizedX: 0.25, normalizedY: 0.35, visible: true },
          ],
        },
      }) as never;
    const overlay = useCursorOverlay(options);

    await nextTick();
    await Promise.resolve();
    await nextTick();
    expect(getCursorImage).toHaveBeenCalledOnce();
    const firstImage = overlay.customCursorImage.value;
    expect(firstImage).toMatchObject({ id: 'stable' });

    getCursorImage.mockClear();
    time.value = 0.75;
    await nextTick();
    await Promise.resolve();
    await nextTick();
    expect(getCursorImage).not.toHaveBeenCalled();
    expect(overlay.customCursorImage.value).toBe(firstImage);

    selection.value = { packId: MACOS_CURSOR_PACK.id, mode: 'fixed', cursorId: 'handpointing' };
    await nextTick();
    await Promise.resolve();
    await nextTick();
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
});
