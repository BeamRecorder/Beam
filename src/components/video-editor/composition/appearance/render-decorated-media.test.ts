import { describe, expect, it, vi } from 'vitest';
import { frameContentRect } from './frames';
import { resolveSafariFrameGeometry, resolveWindowsFrameGeometry } from './frame-geometry';
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
    rect: vi.fn(),
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

const frameFormats = [
  { name: 'small-wide', rect: { x: 7, y: 11, width: 96, height: 32 } },
  { name: 'portrait', rect: { x: 17, y: 23, width: 320, height: 568 } },
  { name: 'ultrawide', rect: { x: 5, y: 9, width: 1_200, height: 200 } },
  { name: 'large', rect: { x: 32, y: 48, width: 4_096, height: 2_160 } },
] as const;

const frameRectOperations = (ctx: ReturnType<typeof context>) => [
  ...vi.mocked(ctx.fillRect).mock.calls,
  ...vi.mocked(ctx.strokeRect).mock.calls,
  ...vi.mocked(ctx.rect).mock.calls.map(([x, y, width, height]) => [x, y, width, height]),
  ...vi.mocked(ctx.roundRect).mock.calls.map(([x, y, width, height]) => [x, y, width, height]),
  ...vi.mocked(ctx.moveTo).mock.calls.map(([x, y]) => [x, y, 0, 0]),
  ...vi.mocked(ctx.lineTo).mock.calls.map(([x, y]) => [x, y, 0, 0]),
  ...vi.mocked(ctx.arc).mock.calls.map(([x, y, radius]) => [x - radius, y - radius, radius * 2, radius * 2]),
];

const nonStretchedFrameFormats = [
  { name: 'portrait', rect: { x: 17, y: 23, width: 720, height: 1_280 } },
  { name: 'ultrawide', rect: { x: 5, y: 9, width: 1_600, height: 800 } },
  { name: 'large', rect: { x: 32, y: 48, width: 4_096, height: 2_160 } },
] as const;

const nonStretchedWindowsFormats = [
  { name: 'portrait', rect: { x: 17, y: 23, width: 1_200, height: 1_600 } },
  { name: 'ultrawide', rect: { x: 5, y: 9, width: 1_600, height: 800 } },
] as const;

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
    const outer = { x: 0, y: 0, width: 160, height: 100 };
    const geometry = resolveSafariFrameGeometry(outer);
    drawDecoratedMedia(ctx, {
      source,
      rect: outer,
      appearance: appearance({ frame: 'safari' }),
      title: 'Screen recording',
    });
    expect(ctx.drawImage).toHaveBeenCalledWith(
      source,
      geometry.content.x,
      geometry.content.y,
      geometry.content.width,
      geometry.content.height,
    );
    expect(ctx.fillText).toHaveBeenCalledWith('Screen recording', expect.any(Number), geometry.header / 2);
  });
  it('scales Safari chrome uniformly instead of stretching only its vertical axis', () => {
    const ctx = context();
    const outer = { x: 0, y: 0, width: 1800, height: 1150 };
    const geometry = resolveSafariFrameGeometry(outer, 1.5);
    drawDecoratedMedia(ctx, {
      source,
      rect: outer,
      appearance: appearance({ frame: 'safari', frameChromeScale: 1.5 }),
      title: 'Scaled',
    });
    expect(ctx.fillText).toHaveBeenCalledWith('Scaled', expect.any(Number), geometry.header / 2);
    expect(ctx.drawImage).toHaveBeenCalledWith(
      source,
      geometry.content.x,
      geometry.content.y,
      geometry.content.width,
      geometry.content.height,
    );
  });
  it('draws Windows 95 chrome and keeps its content rect proportional', () => {
    const outer = { x: 10, y: 20, width: 120, height: 80 };
    const rect = frameContentRect(outer, 'windows-95');
    expect(rect).toEqual(resolveWindowsFrameGeometry(outer).content);
    const ctx = context();
    drawDecoratedMedia(ctx, {
      source,
      rect: { x: 10, y: 20, width: 120, height: 80 },
      appearance: appearance({ frame: 'windows-95', borderEnabled: true }),
      title: 'Clip',
    });
    expect(ctx.drawImage).toHaveBeenCalledWith(source, rect.x, rect.y, rect.width, rect.height);
    expect(ctx.stroke).toHaveBeenCalled();
  });
  it('keeps the Windows 95 title bar at full width when chrome is reduced', () => {
    const ctx = context();
    const outer = { x: 0, y: 0, width: 400, height: 260 };
    const geometry = resolveWindowsFrameGeometry(outer, { chromeScale: 0.5 });
    drawDecoratedMedia(ctx, {
      source,
      rect: outer,
      appearance: appearance({ frame: 'windows-95', frameChromeScale: 0.5 }),
      title: 'Compact',
    });
    const titleBar = vi
      .mocked(ctx.fillRect)
      .mock.calls.find(
        ([x, y, width, height]) =>
          Math.abs(x - geometry.outerInset) < 0.001 &&
          Math.abs(y - geometry.outerInset) < 0.001 &&
          Math.abs(width - (outer.width - geometry.outerInset * 2)) < 0.001 &&
          Math.abs(height - geometry.titleHeight) < 0.001,
      );
    expect(titleBar).toBeDefined();
  });
  it.each(frameFormats)('keeps $name Safari and Windows content rectangles inside their frames', ({ rect }) => {
    for (const frame of ['safari', 'windows-95'] as const) {
      const content = frameContentRect(rect, frame, {
        showMenu: true,
        showScrollbars: true,
        chromeScale: 1,
      });

      expect(content.x).toBeGreaterThanOrEqual(rect.x);
      expect(content.y).toBeGreaterThanOrEqual(rect.y);
      expect(content.x + content.width).toBeLessThanOrEqual(rect.x + rect.width);
      expect(content.y + content.height).toBeLessThanOrEqual(rect.y + rect.height);
      expect(content.width).toBeGreaterThan(0);
      expect(content.height).toBeGreaterThan(0);
    }
  });
  it.each(['safari', 'windows-95'] as const)('does not draw %s chrome outside a compact frame', (frame) => {
    const rect = { x: 7, y: 11, width: 96, height: 32 };
    const ctx = context();
    drawDecoratedMedia(ctx, {
      source,
      rect,
      appearance: appearance({ frame, shadowSize: 'none' }),
      title: 'Compact',
    });

    for (const [x, y, width, height] of frameRectOperations(ctx)) {
      expect(x).toBeGreaterThanOrEqual(rect.x);
      expect(y).toBeGreaterThanOrEqual(rect.y);
      expect(x + width).toBeLessThanOrEqual(rect.x + rect.width);
      expect(y + height).toBeLessThanOrEqual(rect.y + rect.height);
    }
  });
  it.each(['safari', 'windows-95'] as const)(
    'hides secondary %s chrome details when there is no useful compact area',
    (frame) => {
      const ctx = context();
      drawDecoratedMedia(ctx, {
        source,
        rect: { x: 0, y: 0, width: 48, height: 24 },
        appearance: appearance({ frame, shadowSize: 'none' }),
        title: 'Too small',
      });

      const labels = vi.mocked(ctx.fillText).mock.calls.map(([label]) => label);
      if (frame === 'safari') expect(labels).toHaveLength(0);
      else expect(labels).not.toEqual(expect.arrayContaining(['File', 'Edit', 'Search']));
    },
  );
  it.each(nonStretchedFrameFormats)('keeps Safari chrome geometry uniformly scaled on $name canvases', ({ rect }) => {
    const ctx = context();
    drawDecoratedMedia(ctx, {
      source,
      rect,
      appearance: appearance({ frame: 'safari', shadowSize: 'none' }),
      title: 'Proportional',
    });

    const circles = vi.mocked(ctx.arc).mock.calls.slice(0, 3);
    expect(circles).toHaveLength(3);
    const toolbarHeight = (circles[0]![1]! - rect.y) * 2;
    expect((circles[1]![0]! - circles[0]![0]!) / toolbarHeight).toBeCloseTo((57 - 31) / 68, 5);
  });
  it.each(nonStretchedWindowsFormats)(
    'keeps Windows 95 chrome geometry uniformly scaled on $name canvases',
    ({ rect }) => {
      const ctx = context();
      drawDecoratedMedia(ctx, {
        source,
        rect,
        appearance: appearance({ frame: 'windows-95', shadowSize: 'none' }),
        title: 'Proportional',
      });

      const titleBar = vi
        .mocked(ctx.fillRect)
        .mock.calls.find(
          ([x, y, width, height]) =>
            x > rect.x && y > rect.y && width > rect.width * 0.8 && height > 2 && y < rect.y + rect.height / 2,
        );
      expect(titleBar).toBeDefined();
      const [, titleY, , titleHeight] = titleBar!;
      const titleButton = vi
        .mocked(ctx.fillRect)
        .mock.calls.find(
          ([x, y, width, height]) =>
            x > rect.x + rect.width * 0.6 &&
            y > titleY! &&
            y < titleY! + titleHeight! &&
            width >= 10 &&
            Math.abs(width - height) <= 1,
        );
      expect(titleButton).toBeDefined();
      expect(titleHeight! / titleButton![2]!).toBeCloseTo(31 / 18, 1);
    },
  );
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
