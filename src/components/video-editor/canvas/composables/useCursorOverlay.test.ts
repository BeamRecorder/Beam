import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';

const getCursorImage = vi.hoisted(() => vi.fn());
vi.mock('../../properties/cursor/useCursorReplacer', () => ({
  useCursorReplacer: () => ({ getCursorImage }),
  cursorTypeForKind: () => 'default',
}));

import { getRippleStyleColor, useCursorOverlay } from './useCursorOverlay';

const second = (value: number) => value * 1_000_000_000;
const effects = {
  left: { springEnabled: true, springIntensity: 80, rippleEnabled: true, rippleSize: 30, rippleColor: '#ff0000' },
  right: { springEnabled: false, springIntensity: 0, rippleEnabled: false, rippleSize: 20, rippleColor: '#0000ff' },
};

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

const baseOptions = () => ({
  selectedCursor: () => 'automatic' as const,
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
  currentTime: () => 1,
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
  screenClip: () => ({ transform: { x: 0, y: 0, width: 1, height: 1 }, isMirrored: false }) as never,
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
    expect(getCursorImage).toHaveBeenCalledWith('default', 120, '#ffffff');
    expect(options.onRenderOnce).toHaveBeenCalled();
    expect(overlay.customCursorImage.value).not.toBeNull();
  });

  it('draws a Beam fallback for custom cursors without a canvas warning', async () => {
    getCursorImage.mockClear();
    getCursorImage.mockResolvedValue({ complete: true, naturalWidth: 32 } as HTMLImageElement);
    const options = baseOptions();
    const overlay = useCursorOverlay(options);
    await nextTick();
    await Promise.resolve();
    expect(getCursorImage).toHaveBeenLastCalledWith('default', 120, '#ffffff');
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
    expect(overlay.ripples.value).toHaveLength(1);
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

  it('warns when cursor data is unavailable and removes expired ripples', () => {
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
    overlay.ripples.value.push({ x: 1, y: 1, radius: 2, alpha: 0, color: '#fff', size: 10 });
    options.editorData = () => ({ cursor: { available: true, events: [] } }) as never;
    overlay.updateAndDrawRipplesAndCursor(
      ctx,
      { dx: 0, dy: 0, dw: 800, dh: 450, focusX: 0, focusY: 0, scale: 1 },
      1920,
      1080,
      800,
      vi.fn(),
    );
    expect(overlay.ripples.value).toHaveLength(0);
  });

  it('clears the image when the cursor replacement fails', async () => {
    getCursorImage.mockRejectedValue(new Error('cursor unavailable'));
    const options = baseOptions();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const overlay = useCursorOverlay(options);
    await nextTick();
    await Promise.resolve();
    expect(overlay.customCursorImage.value).toBeNull();
    expect(error).toHaveBeenCalledWith('Failed to load custom cursor image:', expect.any(Error));
    error.mockRestore();
  });
});
