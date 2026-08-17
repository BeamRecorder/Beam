import { describe, expect, it, vi } from 'vitest';
import { frameContentRect } from './frames';
import { applyClipShadow, drawDecoratedMedia, shadowBlurForAppearance } from './render-decorated-media';
import type { ClipAppearance } from '~/media/shared/composition-types';

const appearance = (patch: Partial<ClipAppearance> = {}): ClipAppearance => ({
  cornerRadius: 'sm',
  shadowSize: 'none',
  shadowBlur: 0,
  shadowMode: 'solid',
  shadowColor: '#000000',
  shadowDirection: 'all',
  borderEnabled: false,
  borderColor: '#ff0000',
  borderWidth: 2,
  frame: 'none',
  frameTitle: '',
  frameColor: '#c0c0c0',
  frameShowMenu: true,
  frameShowScrollbars: true,
  frameChromeScale: 1,
  ...patch,
});
const context = () =>
  ({
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    arc: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    strokeRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  }) as unknown as CanvasRenderingContext2D;
const source = {} as CanvasImageSource;

describe('decorated media rendering', () => {
  it('draws a border independently from a shadow', () => {
    const ctx = context();
    drawDecoratedMedia(ctx, {
      source,
      rect: { x: 2, y: 3, width: 100, height: 60 },
      appearance: appearance({ borderEnabled: true }),
      title: 'Image',
    });
    expect(ctx.stroke).toHaveBeenCalledOnce();
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 2, 3, 100, 60);
  });
  it('draws an explicit source crop at frame dimensions and mirrors it', () => {
    const ctx = context();
    drawDecoratedMedia(ctx, {
      source,
      sourceRect: { x: 64, y: 36, width: 512, height: 288 },
      rect: { x: 10, y: 20, width: 400, height: 240 },
      appearance: appearance({ shadowSize: 'none' }),
      mirrored: true,
      mirroredY: true,
      title: 'Cropped',
    });
    expect(ctx.scale).toHaveBeenCalledWith(-1, -1);
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 64, 36, 512, 288, 10, 20, 400, 240);
  });
  it('clips circular framing with a real circular path', () => {
    const ctx = context();
    drawDecoratedMedia(ctx, {
      source,
      rect: { x: 10, y: 20, width: 400, height: 240 },
      appearance: appearance({ shadowSize: 'none' }),
      title: 'Circle',
      mask: 'circle',
    });

    expect(ctx.arc).toHaveBeenCalledWith(210, 140, 120, 0, Math.PI * 2);
    expect(ctx.roundRect).not.toHaveBeenCalled();
    expect(ctx.clip).toHaveBeenCalledOnce();
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 10, 20, 400, 240);
  });
  it('clips squircle framing with a superellipse path', () => {
    const ctx = context();
    drawDecoratedMedia(ctx, {
      source,
      rect: { x: 10, y: 20, width: 240, height: 240 },
      appearance: appearance({ shadowSize: 'none' }),
      title: 'Squircle',
      mask: 'squircle',
    });

    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalledTimes(64);
    expect(ctx.closePath).toHaveBeenCalled();
    expect(ctx.roundRect).not.toHaveBeenCalled();
    expect(ctx.clip).toHaveBeenCalledOnce();
  });
  it('draws Safari media inside its chrome and uses the supplied title', () => {
    const ctx = context();
    drawDecoratedMedia(ctx, {
      source,
      rect: { x: 0, y: 0, width: 160, height: 100 },
      appearance: appearance({ frame: 'safari' }),
      title: 'Screen recording',
    });
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 1, 18, 158, 81);
    expect(ctx.fillText).toHaveBeenCalledWith('Screen recording', expect.any(Number), 9);
  });
  it('scales Safari chrome uniformly instead of stretching only its vertical axis', () => {
    const ctx = context();
    drawDecoratedMedia(ctx, {
      source,
      rect: { x: 0, y: 0, width: 1800, height: 1150 },
      appearance: appearance({ frame: 'safari', frameChromeScale: 1.5 }),
      title: 'Scaled',
    });
    expect(ctx.fillText).toHaveBeenCalledWith('Scaled', 876, 51);
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 1, 102, 1798, 1047);
  });
  it('draws Windows 95 chrome and keeps its content rect proportional', () => {
    const rect = frameContentRect({ x: 10, y: 20, width: 120, height: 80 }, 'windows-95');
    expect(rect).toEqual({ x: 13, y: 52, width: 111, height: 44.61538461538461 });
    const ctx = context();
    drawDecoratedMedia(ctx, {
      source,
      rect: { x: 10, y: 20, width: 120, height: 80 },
      appearance: appearance({ frame: 'windows-95', borderEnabled: true }),
      title: 'Clip',
    });
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 13, 52, 111, 44.61538461538461);
    expect(ctx.strokeRect).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });
  it('keeps the Windows 95 title bar at full width when chrome is reduced', () => {
    const ctx = context();
    drawDecoratedMedia(ctx, {
      source,
      rect: { x: 0, y: 0, width: 400, height: 260 },
      appearance: appearance({ frame: 'windows-95', frameChromeScale: 0.5 }),
      title: 'Compact',
    });
    expect(ctx.fillRect).toHaveBeenCalledWith(1, 1, 396, 18);
  });
  it('keeps adaptive color independent from the selected shadow size', () => {
    expect(shadowBlurForAppearance(appearance({ shadowSize: 'none', shadowMode: 'adaptive' }))).toBe(0);
    expect(shadowBlurForAppearance(appearance({ shadowSize: 'sm', shadowMode: 'adaptive' }))).toBe(16);
    expect(shadowBlurForAppearance(appearance({ shadowSize: 'md', shadowMode: 'adaptive' }))).toBe(24);
    expect(shadowBlurForAppearance(appearance({ shadowSize: 'lg', shadowMode: 'adaptive' }))).toBe(32);
    expect(shadowBlurForAppearance(appearance({ shadowSize: 'custom', shadowBlur: 56, shadowMode: 'adaptive' }))).toBe(
      56,
    );
  });
  it('scales output-pixel shadows in the preview', () => {
    const ctx = context();
    applyClipShadow(
      ctx,
      appearance({ shadowSize: 'custom', shadowBlur: 40, shadowMode: 'solid' }),
      source,
      undefined,
      0.5,
    );
    expect(ctx.shadowBlur).toBe(20);
  });
  it('keeps a small directional shadow compact at preview scale', () => {
    const ctx = context();
    applyClipShadow(ctx, appearance({ shadowSize: 'sm', shadowDirection: 'bottom-right' }), source, undefined, 0.5);

    expect(ctx.shadowBlur).toBe(8);
    expect(ctx.shadowOffsetX).toBe(4);
    expect(ctx.shadowOffsetY).toBe(4);
  });
});
