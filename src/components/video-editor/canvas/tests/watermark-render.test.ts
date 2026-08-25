import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_OUTPUT_CANVAS,
  normalizeWatermark,
  type OutputCanvasSettings,
  type WatermarkSettings,
} from '../output-canvas';
import { drawBeamWatermark } from '../watermark-render';

type TextMetricsOverrides = {
  actualBoundingBoxAscent?: number;
  actualBoundingBoxDescent?: number;
};

const createContext = (textMetrics: TextMetricsOverrides = {}) => {
  const shadows = {
    fill: [] as Array<{
      color: unknown;
      blur: unknown;
      offsetX: unknown;
      offsetY: unknown;
    }>,
    logo: [] as Array<{
      color: unknown;
      blur: unknown;
      offsetX: unknown;
      offsetY: unknown;
    }>,
    text: [] as Array<{
      color: unknown;
      blur: unknown;
      offsetX: unknown;
      offsetY: unknown;
    }>,
  };
  const textBaselines: string[] = [];
  const measurementBaselines: string[] = [];
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
    measureText: vi.fn((text: string) => {
      measurementBaselines.push(context.textBaseline);
      return { width: text.length * 10, ...textMetrics };
    }),
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
    fillText: vi.fn(() => {
      textBaselines.push(context.textBaseline);
      shadows.text.push({
        color: context.shadowColor,
        blur: context.shadowBlur,
        offsetX: context.shadowOffsetX,
        offsetY: context.shadowOffsetY,
      });
    }),
    drawImage: vi.fn(() =>
      shadows.logo.push({
        color: context.shadowColor,
        blur: context.shadowBlur,
        offsetX: context.shadowOffsetX,
        offsetY: context.shadowOffsetY,
      }),
    ),
  } as unknown as CanvasRenderingContext2D;
  return { context, shadows, textBaselines, measurementBaselines };
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

    drawBeamWatermark(
      context,
      {
        ...canvas({}),
        watermark: { ...canvas({}).watermark!, enabled: false },
      },
      viewport,
    );

    expect(context.save).not.toHaveBeenCalled();
    expect(context.roundRect).not.toHaveBeenCalled();
    expect(context.fillText).not.toHaveBeenCalled();
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it.each([100, 200])('keeps a logo-only watermark centered at size %s', (size) => {
    const { context } = createContext();
    const logo = {} as CanvasImageSource;

    drawBeamWatermark(context, canvas({ text: 'none', showLogo: true, size }), viewport, logo);

    const [image, destinationX, destinationY, destinationWidth, destinationHeight] = (
      context.drawImage as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0]!;
    const [badgeX, badgeY, , badgeHeight] = (context.roundRect as unknown as { mock: { calls: number[][] } }).mock
      .calls[0]!;

    expect(image).toBe(logo);
    expect((context.drawImage as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]).toHaveLength(5);
    expect(destinationX).toBeGreaterThan(badgeX);
    expect(destinationY).toBeCloseTo(badgeY + (badgeHeight - Number(destinationHeight)) / 2, 5);
    expect(destinationWidth).toBe(destinationHeight);
    expect(context.fillText).not.toHaveBeenCalled();
    expect(context.roundRect).toHaveBeenCalledOnce();
  });

  it.each([100, 200])('visually centers the full logo and text inside the badge at size %s', (size) => {
    const ascent = 10 * (size / 100);
    const descent = 4 * (size / 100);
    const { context, textBaselines, measurementBaselines } = createContext({
      actualBoundingBoxAscent: ascent,
      actualBoundingBoxDescent: descent,
    });
    const logo = {} as CanvasImageSource;

    drawBeamWatermark(context, canvas({ text: 'beam', showLogo: true, position: 'top-left', size }), viewport, logo);

    expect(measurementBaselines).toEqual(['alphabetic']);
    expect(textBaselines).toEqual(['alphabetic']);
    const [text, textX, textY] = (context.fillText as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    const [, badgeY, , badgeHeight] = (context.roundRect as unknown as { mock: { calls: number[][] } }).mock.calls[0]!;
    const [, , iconY, , iconHeight] = (context.drawImage as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    const badgeCenterY = badgeY + badgeHeight / 2;
    expect(text).toBe('Beam');
    expect(textX).toBeGreaterThan(0);
    const glyphCenterY = Number(textY) - ascent + (ascent + descent) / 2;
    expect(glyphCenterY).toBe(badgeCenterY);
    expect(Number(iconY) + Number(iconHeight) / 2).toBe(badgeCenterY);
  });

  it.each([100, 200])('keeps text-only baseline and Y centered at size %s', (size) => {
    const { context, textBaselines, measurementBaselines } = createContext({
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 4,
    });

    drawBeamWatermark(context, canvas({ text: 'beam', showLogo: false, size }), viewport);

    const [, badgeY, , badgeHeight] = (context.roundRect as unknown as { mock: { calls: number[][] } }).mock.calls[0]!;
    const [, , textY] = (context.fillText as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(measurementBaselines).toEqual(['middle']);
    expect(textBaselines).toEqual(['middle']);
    expect(textY).toBeCloseTo(badgeY + badgeHeight / 2, 5);
  });

  it('renders Made with Beam without a logo and uses the sans-serif fallback stack', () => {
    const { context } = createContext();

    drawBeamWatermark(context, canvas({ text: 'made-with-beam', showLogo: false }), viewport);

    expect(context.font).toContain('Inter');
    expect(context.font).toContain('ui-sans-serif');
    expect(context.font).toContain('system-ui');
    expect(context.textBaseline).toBe('middle');
    expect(context.fillText).toHaveBeenCalledWith('Made with Beam.', expect.any(Number), expect.any(Number));
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('renders the Beam text mode without a logo', () => {
    const { context } = createContext();

    drawBeamWatermark(context, canvas({ text: 'beam', showLogo: false }), viewport);

    expect(context.fillText).toHaveBeenCalledWith('Beam', expect.any(Number), expect.any(Number));
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('renders custom watermark text without a logo', () => {
    const { context } = createContext();

    drawBeamWatermark(context, canvas({ text: 'custom', customText: 'My Channel', showLogo: false }), viewport);

    expect(context.fillText).toHaveBeenCalledWith('My Channel', expect.any(Number), expect.any(Number));
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('renders custom watermark text with a logo', () => {
    const { context } = createContext();
    const logo = {} as CanvasImageSource;

    drawBeamWatermark(context, canvas({ text: 'custom', customText: 'My Channel', showLogo: true }), viewport, logo);

    expect(context.drawImage).toHaveBeenCalled();
    expect(context.fillText).toHaveBeenCalledWith('My Channel', expect.any(Number), expect.any(Number));
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
    expect(textY).toBe(693);
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
