import { describe, expect, it, vi } from 'vitest';
import { frameContentRect, frameMediaRect } from './frames';
import { resolvePhoneFrameGeometry } from './frame-geometry';
import { DEFAULT_CLIP_APPEARANCE, drawDecoratedMedia } from './render-decorated-media';
import { containedMediaRect } from '../../canvas/output-canvas';

const phoneFrames = ['iphone-16-max', 'pixel-9-pro'] as const;
const source = {} as CanvasImageSource;
const nativePhoneSize = (frame: (typeof phoneFrames)[number]) =>
  frame === 'iphone-16-max' ? { width: 415, height: 843 } : { width: 353, height: 745 };
const fittedPhoneRect = (
  bounds: { x: number; y: number; width: number; height: number },
  frame: (typeof phoneFrames)[number],
) => {
  const fit = containedMediaRect(
    nativePhoneSize(frame).width,
    nativePhoneSize(frame).height,
    bounds.width,
    bounds.height,
  );
  return { x: bounds.x + fit.x, y: bounds.y + fit.y, width: fit.width, height: fit.height };
};
const context = () => {
  const fillStyles: unknown[] = [];
  const operations: Array<{ type: 'fill' | 'drawImage'; style?: unknown }> = [];
  let currentFillStyle: unknown;
  const value = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(() => operations.push({ type: 'fill', style: currentFillStyle })),
    stroke: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(() => operations.push({ type: 'drawImage' })),
    fillRect: vi.fn(),
    arc: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillStyles,
    operations,
  };
  Object.defineProperty(value, 'fillStyle', {
    configurable: true,
    get: () => currentFillStyle,
    set: (next: unknown) => {
      currentFillStyle = next;
      fillStyles.push(next);
    },
  });
  return value as unknown as CanvasRenderingContext2D & {
    fillStyles: unknown[];
    operations: Array<{ type: 'fill' | 'drawImage'; style?: unknown }>;
  };
};

describe('phone frame rendering', () => {
  it.each(phoneFrames)('uses the Telephone content inset for the %s frame', (frame) => {
    const rect = { x: 12, y: 18, width: 415, height: 843 };
    const geometry = resolvePhoneFrameGeometry(rect, frame);
    const content = frameContentRect(rect, frame);

    expect(content).toEqual(geometry.content);
    expect(content.x).toBeGreaterThan(rect.x);
    expect(content.y).toBeGreaterThan(rect.y);
    expect(content.x + content.width).toBeLessThan(rect.x + rect.width);
    expect(content.y + content.height).toBeLessThan(rect.y + rect.height);
    expect(content.width).toBeGreaterThan(0);
    expect(content.height).toBeGreaterThan(0);
    expect(geometry.outerRadius).toBeLessThanOrEqual(Math.min(rect.width / 2, rect.height / 2));
    expect(geometry.contentRadius).toBeLessThanOrEqual(content.width / 2);
  });

  it.each(phoneFrames)('clips the media and paints a bezel for %s on compact rectangles', (frame) => {
    const ctx = context();
    const rect = { x: 7, y: 9, width: 32, height: 48 };
    const geometry = resolvePhoneFrameGeometry(rect, frame);

    drawDecoratedMedia(ctx, {
      source,
      rect,
      appearance: { ...DEFAULT_CLIP_APPEARANCE, frame, shadowSize: 'none', shadowBlur: 0 },
      title: 'Phone recording',
    });

    // The outer frame and the configurable phone background each establish
    // their own clipping region before the media is painted.
    expect(ctx.clip).toHaveBeenCalledTimes(2);
    expect(ctx.roundRect).toHaveBeenCalledWith(
      geometry.outer.x,
      geometry.outer.y,
      geometry.outer.width,
      geometry.outer.height,
      geometry.outerRadius,
    );
    expect(ctx.roundRect).toHaveBeenCalledWith(
      geometry.content.x,
      geometry.content.y,
      geometry.content.width,
      geometry.content.height,
      geometry.contentRadius,
    );
    const media = frameMediaRect(rect, frame, rect.width, rect.height);
    expect(ctx.drawImage).toHaveBeenCalledWith(source, media.x, media.y, media.width, media.height);
    expect(ctx.fill).toHaveBeenCalledWith('evenodd');
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it.each(phoneFrames)('paints the final %s bezel with frameColor after the media', (frame) => {
    const ctx = context();
    const frameColor = '#123456';
    const rect = { x: 12, y: 18, width: 415, height: 843 };

    drawDecoratedMedia(ctx, {
      source,
      rect,
      appearance: {
        ...DEFAULT_CLIP_APPEARANCE,
        frame,
        frameColor,
        shadowSize: 'none',
        shadowBlur: 0,
        phoneFrameFill: { kind: 'color', color: '#abcdef' },
      },
      title: 'Custom frame color',
    });

    const mediaIndex = ctx.operations.findIndex(({ type }) => type === 'drawImage');
    const finalBezelIndex = ctx.operations.findIndex(
      ({ type, style }, index) => index > mediaIndex && type === 'fill' && style === frameColor,
    );

    expect(mediaIndex).toBeGreaterThanOrEqual(0);
    expect(finalBezelIndex).toBeGreaterThan(mediaIndex);
    expect(ctx.fillStyles).toContain(frameColor);
    expect(ctx.createLinearGradient).not.toHaveBeenCalled();
    expect(ctx.clip).toHaveBeenCalledTimes(2);
  });

  it.each(phoneFrames)('centers the native %s outer aspect inside wide and tall bounds', (frame) => {
    for (const bounds of [
      { x: 30, y: 40, width: 1_000, height: 500 },
      { x: 50, y: 60, width: 500, height: 1_000 },
    ]) {
      const ctx = context();
      const outer = fittedPhoneRect(bounds, frame);
      const geometry = resolvePhoneFrameGeometry(outer, frame);

      drawDecoratedMedia(ctx, {
        source,
        rect: bounds,
        appearance: { ...DEFAULT_CLIP_APPEARANCE, frame, shadowSize: 'none', shadowBlur: 0 },
        title: 'Phone recording',
      });

      expect(outer.width / outer.height).toBeCloseTo(nativePhoneSize(frame).width / nativePhoneSize(frame).height, 6);
      expect(
        vi
          .mocked(ctx.roundRect)
          .mock.calls.some(
            ([x, y, width, height, radius]) =>
              Math.abs(x - outer.x) < 1e-8 &&
              Math.abs(y - outer.y) < 1e-8 &&
              Math.abs(width - outer.width) < 1e-8 &&
              Math.abs(height - outer.height) < 1e-8 &&
              typeof radius === 'number' &&
              Math.abs(radius - geometry.outerRadius) < 1e-8,
          ),
      ).toBe(true);
      const media = frameMediaRect(bounds, frame, bounds.width, bounds.height);
      expect(ctx.drawImage).toHaveBeenCalledWith(source, media.x, media.y, media.width, media.height);
    }
  });

  it.each(phoneFrames)('contains a 16:9 source inside the fitted %s phone content without stretching', (frame) => {
    const bounds = { x: 30, y: 40, width: 1_000, height: 500 };
    const outer = fittedPhoneRect(bounds, frame);
    const content = resolvePhoneFrameGeometry(outer, frame).content;
    const sourceRect = { x: 0, y: 0, width: 1_920, height: 1_080 };
    const media = containedMediaRect(sourceRect.width, sourceRect.height, content.width, content.height);
    const ctx = context();

    drawDecoratedMedia(ctx, {
      source,
      sourceRect,
      rect: bounds,
      appearance: { ...DEFAULT_CLIP_APPEARANCE, frame, shadowSize: 'none', shadowBlur: 0 },
      title: '16:9 recording',
    });

    const drawCall = vi.mocked(ctx.drawImage).mock.calls[0];
    expect(drawCall?.[0]).toBe(source);
    expect(drawCall?.[1]).toBe(sourceRect.x);
    expect(drawCall?.[2]).toBe(sourceRect.y);
    expect(drawCall?.[3]).toBe(sourceRect.width);
    expect(drawCall?.[4]).toBe(sourceRect.height);
    expect(drawCall?.[5]).toBeCloseTo(content.x + media.x, 8);
    expect(drawCall?.[6]).toBeCloseTo(content.y + media.y, 8);
    expect(drawCall?.[7]).toBeCloseTo(media.width, 8);
    expect(drawCall?.[8]).toBeCloseTo(media.height, 8);
    expect(media.width / media.height).toBeCloseTo(sourceRect.width / sourceRect.height, 6);
    expect(media.width).toBeLessThanOrEqual(content.width);
    expect(media.height).toBeLessThanOrEqual(content.height);
  });
});
