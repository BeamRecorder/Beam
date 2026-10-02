import { describe, expect, it, vi } from 'vitest';
import { paintTimelineArtwork } from '@beam/runtime/timeline/timeline-canvas-artwork';
import type { TimelineCanvasArtwork, TimelineCanvasPalette } from '@beam/runtime/timeline/timeline-canvas-types';
import type { ColorGradient } from '@beam/engine/shared/color-fill-types';

const palette: TimelineCanvasPalette = {
  background: '#000',
  text: '#fff',
  border: '#777',
  selected: '#0ff',
  video: '#00f',
  annotation: '#f0f',
  blur: '#f00',
  highlight: '#fa0',
  audio: '#0f0',
  zoom: '#ff0',
  labelBackground: '#123',
  labelText: '#abc',
  curve: '#ccc',
  radius: 6,
  tint: 0.36,
  disabledOpacity: 0.3,
  effectInset: 6,
  effectHeight: 36,
};
const rect = { x: 0, y: 2, width: 100, height: 28 };
const image = (width = 100, height = 100) => ({ naturalWidth: width, naturalHeight: height }) as HTMLImageElement;
function context() {
  const alphas: number[] = [],
    saved: number[] = [];
  const gradient = { addColorStop: vi.fn() };
  const ctx = {
    canvas: { width: 3000 },
    globalAlpha: 0.5,
    fillStyle: '',
    font: '',
    drawImage: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    createRadialGradient: vi.fn(() => gradient),
    save: vi.fn(() => saved.push(ctx.globalAlpha)),
    restore: vi.fn(() => {
      ctx.globalAlpha = saved.pop()!;
    }),
    fillRect: vi.fn(() => alphas.push(ctx.globalAlpha)),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, alphas, gradient };
}
const paint = (ctx: CanvasRenderingContext2D, artwork: TimelineCanvasArtwork, bounds = rect, viewport = 1000) =>
  paintTimelineArtwork(ctx, artwork, bounds, 1000, palette, viewport);

describe('canvas timeline color artwork', () => {
  it('paints the saved flat fill without creating a gradient', () => {
    const { ctx } = context();
    paint(ctx, { kind: 'color', fill: { kind: 'color', color: '#aabbcc' } });
    expect(ctx.fillStyle).toBe('#aabbcc');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 2, 100, 28);
    expect(ctx.createLinearGradient).not.toHaveBeenCalled();
    expect(ctx.createRadialGradient).not.toHaveBeenCalled();
  });
  it.each(['linear', 'radial'] as const)('preserves %s geometry and individual stop alpha', (type) => {
    const { ctx, gradient } = context();
    const spec: ColorGradient = {
      type,
      angle: 90,
      stops: [
        { id: 'a', position: 0, color: '#112233', alpha: 0 },
        { id: 'b', position: 0.4, color: '#aabbcc', alpha: 0.5 },
        { id: 'c', position: 1, color: '#ffffff', alpha: 1 },
      ],
    };
    paint(ctx, { kind: 'color', fill: { kind: 'gradient', gradient: spec } });
    expect(gradient.addColorStop.mock.calls).toEqual([
      [0, '#11223300'],
      [0.4, '#aabbcc80'],
      [1, '#ffffffff'],
    ]);
    if (type === 'linear')
      expect(ctx.createLinearGradient).toHaveBeenCalledWith(0, expect.closeTo(16), 100, expect.closeTo(16));
    else expect(ctx.createRadialGradient).toHaveBeenCalledWith(50, 16, 0, 50, 16, Math.hypot(100, 28) / 2);
  });
});

describe('canvas timeline real thumbnail artwork', () => {
  it('crops a ready source using centered cover and the actual slot source placement', () => {
    const { ctx } = context(),
      source = image();
    paint(ctx, {
      kind: 'thumbnails',
      frames: [{ relativeMs: 500, durationMs: 500, source, pending: false }],
    });
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 0, 22, 100, 56, 50, 2, 50, 28);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
  it('keeps a ready low-detail source painted during refinement and overlays pending bins once', () => {
    const { ctx, alphas } = context(),
      source = image();
    paint(ctx, {
      kind: 'thumbnails',
      frames: [
        { relativeMs: 0, durationMs: 500, source, pending: true },
        { relativeMs: 500, durationMs: 500, pending: true },
      ],
    });
    expect(ctx.drawImage).toHaveBeenCalledOnce();
    expect(vi.mocked(ctx.fillRect).mock.calls).toEqual([
      [0, 2, 50, 28],
      [50, 2, 50, 28],
    ]);
    expect(alphas).toEqual([0.5 * 0.15, 0.5 * 0.32]);
    expect(ctx.globalAlpha).toBe(0.5);
  });
  it('does not fabricate images for missing slots or an empty source request', () => {
    const { ctx } = context();
    paint(ctx, {
      kind: 'thumbnails',
      frames: [{ relativeMs: 0, durationMs: 1000, pending: false }],
    });
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 2, 100, 28);
    paint(ctx, { kind: 'thumbnails' });
    expect(ctx.fillRect).toHaveBeenCalledOnce();
  });
});

describe('canvas timeline tiled image and shape artwork', () => {
  it('tiles real images at their aspect ratio across the clip width', () => {
    const { ctx } = context(),
      source = image(20, 10);
    paint(ctx, { kind: 'image', source });
    expect(vi.mocked(ctx.drawImage).mock.calls).toEqual([
      [source, 0, 2, 56, 28],
      [source, 56, 2, 56, 28],
    ]);
  });
  it('preserves shape inset and padded height without stretching the bitmap', () => {
    const { ctx } = context(),
      source = image(20, 10);
    paint(ctx, { kind: 'shape', source });
    expect(vi.mocked(ctx.drawImage).mock.calls).toEqual([
      [source, 5, 5, 44, 22],
      [source, 49, 5, 44, 22],
      [source, 93, 5, 44, 22],
    ]);
  });
  it('keeps a positive shape tile height when a tiny lane is shorter than the artwork padding', () => {
    const { ctx } = context(),
      source = image(20, 10);
    paint(ctx, { kind: 'shape', source }, { ...rect, height: 4 });
    expect(vi.mocked(ctx.drawImage).mock.calls[0]).toEqual([source, 5, 3.5, 2, 1]);
  });
  it('starts at the first visible tile for very long offscreen artwork and respects logical viewport width', () => {
    const { ctx } = context(),
      source = image(20, 10);
    paint(ctx, { kind: 'image', source }, { ...rect, x: -100000, width: 200000 }, 100);
    expect(vi.mocked(ctx.drawImage).mock.calls.length).toBeLessThanOrEqual(3);
    expect(vi.mocked(ctx.drawImage).mock.calls[0]![1]).toBeGreaterThanOrEqual(-56);
    expect(vi.mocked(ctx.drawImage).mock.calls.at(-1)![1]).toBeLessThan(100);
  });
  it('shows loading and failure explicitly without attempting to draw nonexistent artwork', () => {
    const { ctx } = context();
    paint(ctx, { kind: 'shape', loading: true });
    expect(ctx.fillText).toHaveBeenCalledWith('…', 50, 16, 84);
    paint(ctx, { kind: 'image', error: 'source unavailable', loading: true });
    expect(ctx.fillText).toHaveBeenCalledWith('!', 50, 16, 84);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});
