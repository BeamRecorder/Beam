import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_OUTPUT_CANVAS,
  normalizeWatermark,
  type OutputCanvasSettings,
  type WatermarkSettings,
} from '../output-canvas';
import { drawBeamWatermark } from '../watermark-render';

const createContext = () => {
  const shadows = {
    fill: [] as Array<{ color: unknown; blur: unknown; offsetX: unknown; offsetY: unknown }>,
    logo: [] as Array<{ color: unknown; blur: unknown; offsetX: unknown; offsetY: unknown }>,
    text: [] as Array<{ color: unknown; blur: unknown; offsetX: unknown; offsetY: unknown }>,
  };
  const context = {
    font: '',
    textBaseline: '',
    fillStyle: '',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save: vi.fn(),
    restore: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(() =>
      shadows.fill.push({
        color: context.shadowColor,
        blur: context.shadowBlur,
        offsetX: context.shadowOffsetX,
        offsetY: context.shadowOffsetY,
      }),
    ),
    fillText: vi.fn(() =>
      shadows.text.push({
        color: context.shadowColor,
        blur: context.shadowBlur,
        offsetX: context.shadowOffsetX,
        offsetY: context.shadowOffsetY,
      }),
    ),
    drawImage: vi.fn(() =>
      shadows.logo.push({
        color: context.shadowColor,
        blur: context.shadowBlur,
        offsetX: context.shadowOffsetX,
        offsetY: context.shadowOffsetY,
      }),
    ),
  } as unknown as CanvasRenderingContext2D;
  return { context, shadows };
};

const canvas = (watermark: Partial<WatermarkSettings>): OutputCanvasSettings => ({
  ...DEFAULT_OUTPUT_CANVAS,
  watermark: {
    ...DEFAULT_OUTPUT_CANVAS.watermark!,
    enabled: true,
    ...watermark,
  },
});

const viewport = { x: 10, y: 20, width: 720, height: 720 };

describe('drawBeamWatermark', () => {
  it('does not touch the canvas when the watermark is disabled', () => {
    const { context } = createContext();

    drawBeamWatermark(context, { ...canvas({}), watermark: { ...canvas({}).watermark!, enabled: false } }, viewport);

    expect(context.save).not.toHaveBeenCalled();
    expect(context.roundRect).not.toHaveBeenCalled();
    expect(context.fillText).not.toHaveBeenCalled();
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('renders a logo-only watermark without a text stack', () => {
    const { context } = createContext();
    const logo = {} as CanvasImageSource;

    drawBeamWatermark(context, canvas({ text: 'none', showLogo: true }), viewport, logo);

    expect(context.drawImage).toHaveBeenCalledWith(logo, 93, 93, 1068, 1068, 680, 693, 22, 22);
    expect(context.fillText).not.toHaveBeenCalled();
    expect(context.roundRect).toHaveBeenCalledOnce();
  });

  it('keeps the cropped logo aligned with the badge and optically offsets its text', () => {
    const { context } = createContext();
    const logo = {} as CanvasImageSource;

    drawBeamWatermark(context, canvas({ text: 'beam', showLogo: true, position: 'top-left' }), viewport, logo);

    expect(context.drawImage).toHaveBeenCalledWith(logo, 93, 93, 1068, 1068, 38, 45, 22, 22);
    const [text, textX, textY] = (context.fillText as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(text).toBe('Beam');
    expect(textX).toBe(67);
    expect(textY).toBeCloseTo(60, 0);
  });

  it('renders Made with Beam without a logo and uses the sans-serif fallback stack', () => {
    const { context } = createContext();

    drawBeamWatermark(context, canvas({ text: 'made-with-beam', showLogo: false }), viewport);

    expect(context.font).toContain('Inter');
    expect(context.font).toContain('ui-sans-serif');
    expect(context.font).toContain('system-ui');
    expect(context.fillText).toHaveBeenCalledWith('Made with Beam.', expect.any(Number), expect.any(Number));
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('renders the Beam text mode without a logo', () => {
    const { context } = createContext();

    drawBeamWatermark(context, canvas({ text: 'beam', showLogo: false }), viewport);

    expect(context.fillText).toHaveBeenCalledWith('Beam', expect.any(Number), expect.any(Number));
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it.each([
    ['top-left', 28, 38],
    ['top-right', 652, 38],
    ['bottom-left', 28, 693],
    ['bottom-right', 652, 693],
  ] as const)('anchors %s at the expected corner', (position, expectedX, expectedY) => {
    const { context } = createContext();

    drawBeamWatermark(context, canvas({ text: 'beam', showLogo: false, position }), viewport);

    expect(context.roundRect).toHaveBeenCalledWith(expectedX, expectedY, 60, 29, expect.any(Number));
  });

  it('scales the watermark geometry with its size setting', () => {
    const { context } = createContext();

    drawBeamWatermark(context, canvas({ text: 'beam', showLogo: false, size: 200 }), viewport);

    expect(context.roundRect).toHaveBeenCalledWith(632, 664, 80, 58, expect.any(Number));
    const [, textX, textY] = (context.fillText as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(textX).toBe(652);
    expect(textY).toBeCloseTo(700.8, 1);
  });

  it('keeps the corner margin fixed when the watermark size changes', () => {
    const small = createContext();
    const large = createContext();

    drawBeamWatermark(small.context, canvas({ text: 'beam', showLogo: false, size: 100 }), viewport);
    drawBeamWatermark(large.context, canvas({ text: 'beam', showLogo: false, size: 200 }), viewport);

    const smallRect = (small.context.roundRect as unknown as { mock: { calls: number[][] } }).mock.calls[0]!;
    const largeRect = (large.context.roundRect as unknown as { mock: { calls: number[][] } }).mock.calls[0]!;
    expect(smallRect[0]! + smallRect[2]!).toBeCloseTo(712, 5);
    expect(largeRect[0]! + largeRect[2]!).toBeCloseTo(712, 5);
    expect(smallRect[1]! + smallRect[3]!).toBeCloseTo(722, 5);
    expect(largeRect[1]! + largeRect[3]!).toBeCloseTo(722, 5);
  });

  it('applies the controlled shadow only to the badge fill', () => {
    const { context, shadows } = createContext();

    drawBeamWatermark(context, canvas({ text: 'beam', showLogo: true, shadow: 60 }), viewport, {} as CanvasImageSource);

    expect(shadows.fill).toHaveLength(1);
    expect(shadows.fill[0]!.color).toMatch(/^rgba\(0, 0, 0, 0\.[0-9]+\)$/);
    expect(shadows.fill[0]!.blur).toBeGreaterThan(0);
    expect(shadows.fill[0]!.offsetX).toBe(0);
    expect(shadows.fill[0]!.offsetY).toBe(0);
    expect(shadows.logo).toEqual([{ color: 'transparent', blur: 0, offsetX: 0, offsetY: 0 }]);
    expect(shadows.text).toEqual([{ color: 'transparent', blur: 0, offsetX: 0, offsetY: 0 }]);
  });

  it('normalizes the watermark shadow default and bounds', () => {
    expect(normalizeWatermark(undefined).shadow).toBe(20);
    expect(normalizeWatermark({ shadow: -1 }).shadow).toBe(0);
    expect(normalizeWatermark({ shadow: 101 }).shadow).toBe(100);
  });
});
