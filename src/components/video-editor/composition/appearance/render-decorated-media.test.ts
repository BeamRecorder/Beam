import { describe, expect, it, vi } from 'vitest';
import { frameContentRect, frameMediaRect } from './frames';
import { resolveSafariFrameGeometry, resolveWindowsFrameGeometry } from './frame-geometry';
import { applyClipShadow, drawDecoratedMedia, shadowBlurForAppearance } from './render-decorated-media';
import { adaptivePhoneFillColors } from './phone-frame-fill';
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
const context = () => {
  const fillStyles: unknown[] = [];
  const filterWrites: unknown[] = [];
  const value = {
    fillStyle: '',
    globalAlpha: 1,
    filter: 'none',
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
    clearRect: vi.fn(),
    setTransform: vi.fn(),
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
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillStyles,
    filterWrites,
  };
  Object.defineProperty(value, 'fillStyle', {
    configurable: true,
    get: () => fillStyles.at(-1),
    set: (next: unknown) => fillStyles.push(next),
  });
  Object.defineProperty(value, 'filter', {
    configurable: true,
    get: () => filterWrites.at(-1) ?? 'none',
    set: (next: unknown) => filterWrites.push(next),
  });
  return value as unknown as CanvasRenderingContext2D & { fillStyles: unknown[]; filterWrites: unknown[] };
};
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
  it('uses a transparent source surface as the shadow caster for alpha-aware images', () => {
    const ctx = context();
    const alphaContext = context();
    const alphaSurface = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => alphaContext),
    } as unknown as OffscreenCanvas;
    const surfaces: unknown[] = [alphaSurface];
    class FakeOffscreenCanvas {
      width = 0;
      height = 0;
      getContext = vi.fn(() => alphaContext);

      constructor() {
        surfaces.push(this);
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    vi.stubGlobal('document', { createElement: vi.fn(() => alphaSurface) });

    try {
      drawDecoratedMedia(ctx, {
        source,
        sourceRect: { x: 64, y: 36, width: 512, height: 288 },
        rect: { x: 2, y: 3, width: 100, height: 60 },
        appearance: appearance({ shadowSize: 'md' }),
        shadowFollowsSourceAlpha: true,
        title: 'Transparent image',
      });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(ctx.fill).not.toHaveBeenCalled();
    expect(alphaContext.fill).not.toHaveBeenCalled();
    const alphaDrawImage = alphaContext.drawImage as ReturnType<typeof vi.fn>;
    const targetDrawImage = ctx.drawImage as ReturnType<typeof vi.fn>;
    expect(
      alphaDrawImage.mock.calls.some((call) => {
        const [drawn, x, y, width, height] = call;
        return drawn === source && x === 64 && y === 36 && width === 512 && height === 288;
      }),
    ).toBe(true);
    expect(alphaContext.imageSmoothingEnabled).toBe(true);
    expect(alphaContext.imageSmoothingQuality).toBe('high');
    expect(targetDrawImage.mock.calls.some((call) => surfaces.includes(call[0]))).toBe(true);
  });

  it('scales a custom corner radius and alpha shadow caster with the preview scale', () => {
    const ctx = context();
    const alphaContext = context();
    const scaledSource = {} as CanvasImageSource;
    class FakeOffscreenCanvas {
      width = 0;
      height = 0;
      getContext = vi.fn(() => alphaContext);
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    try {
      drawDecoratedMedia(ctx, {
        source: scaledSource,
        rect: { x: 4, y: 6, width: 240, height: 160 },
        appearance: appearance({ cornerRadius: 72, shadowSize: 'custom', shadowBlur: 40 }),
        shadowScale: 0.5,
        shadowFollowsSourceAlpha: true,
        title: 'Scaled image',
      });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(alphaContext.roundRect).toHaveBeenCalledWith(0, 0, 240, 160, 36);
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.any(FakeOffscreenCanvas), 4, 6, 240, 160);
  });

  it('keeps a custom corner radius at output scale for export shadow casting', () => {
    const ctx = context();
    const alphaContext = context();
    const exportSource = {} as CanvasImageSource;
    class FakeOffscreenCanvas {
      width = 0;
      height = 0;
      getContext = vi.fn(() => alphaContext);
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    try {
      drawDecoratedMedia(ctx, {
        source: exportSource,
        rect: { x: 4, y: 6, width: 240, height: 160 },
        appearance: appearance({ cornerRadius: 72, shadowSize: 'custom', shadowBlur: 40 }),
        shadowFollowsSourceAlpha: true,
        title: 'Export image',
      });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(alphaContext.roundRect).toHaveBeenCalledWith(0, 0, 240, 160, 72);
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.any(FakeOffscreenCanvas), 4, 6, 240, 160);
  });

  it('keeps the geometric shadow caster for opaque video fallback rendering', () => {
    const ctx = context();
    drawDecoratedMedia(ctx, {
      source,
      rect: { x: 2, y: 3, width: 100, height: 60 },
      appearance: appearance({ shadowSize: 'md' }),
      shadowFollowsSourceAlpha: false,
      title: 'Video',
    });

    const clip = ctx.clip as ReturnType<typeof vi.fn>;
    const fill = ctx.fill as ReturnType<typeof vi.fn>;
    const evenOddClipCall = clip.mock.calls.findIndex((call) => call[0] === 'evenodd');
    expect(evenOddClipCall).toBeGreaterThanOrEqual(0);
    expect(ctx.fill).toHaveBeenCalledOnce();
    expect(fill.mock.invocationCallOrder[0]).toBeGreaterThan(
      clip.mock.invocationCallOrder[evenOddClipCall] ?? Number.POSITIVE_INFINITY,
    );
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 2, 3, 100, 60);
  });
  it('draws an explicit source crop at frame dimensions and mirrors it', () => {
    const ctx = context();
    drawDecoratedMedia(ctx, {
      source,
      sourceRect: { x: 64, y: 36, width: 512, height: 288 },
      rect: { x: 10, y: 20, width: 400, height: 240 },
      appearance: appearance({ shadowSize: 'none' }),
      shadowFollowsSourceAlpha: true,
      mirrored: true,
      mirroredY: true,
      title: 'Cropped',
    });
    expect(ctx.scale).toHaveBeenCalledWith(-1, -1);
    expect(vi.mocked(ctx.clip).mock.calls).toEqual([[]]);
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
    expect(vi.mocked(ctx.clip).mock.calls).toEqual([[]]);
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
  it('paints a solid phone fit background across the inner screen before contained media', () => {
    const ctx = context();
    const rect = { x: 12, y: 8, width: 415, height: 843 };
    const phoneSource = { videoWidth: 1_920, videoHeight: 1_080 } as unknown as CanvasImageSource;
    const screen = frameContentRect(rect, 'iphone-16-max');
    const media = frameMediaRect(rect, 'iphone-16-max', 1_920, 1_080);

    drawDecoratedMedia(ctx, {
      source: phoneSource,
      rect,
      appearance: appearance({
        frame: 'iphone-16-max',
        shadowSize: 'none',
        phoneFrameFill: { kind: 'color', color: '#123456' },
      }),
      title: 'Phone fit',
    });

    expect(ctx.fillStyles).toContain('#123456');
    expect(ctx.fillRect).toHaveBeenCalledWith(screen.x, screen.y, screen.width, screen.height);
    expect(ctx.drawImage).toHaveBeenCalledWith(phoneSource, media.x, media.y, media.width, media.height);
  });

  it('renders a radial phone fit gradient with alpha stops over the inner screen', () => {
    const ctx = context();
    const rect = { x: 0, y: 0, width: 353, height: 745 };
    const screen = frameContentRect(rect, 'pixel-9-pro');
    const phoneSource = { videoWidth: 1_080, videoHeight: 1_920 } as unknown as CanvasImageSource;

    drawDecoratedMedia(ctx, {
      source: phoneSource,
      rect,
      appearance: appearance({
        frame: 'pixel-9-pro',
        shadowSize: 'none',
        phoneFrameFill: {
          kind: 'gradient',
          gradient: {
            type: 'radial',
            angle: 180,
            stops: [
              { id: 'inner', position: 0, color: '#ffffff', alpha: 0.25 },
              { id: 'outer', position: 1, color: '#000000', alpha: 0.75 },
            ],
          },
        },
      }),
      title: 'Phone gradient',
    });

    const radial = vi.mocked(ctx.createRadialGradient);
    expect(radial).toHaveBeenCalledOnce();
    const gradient = radial.mock.results[0]?.value as { addColorStop: ReturnType<typeof vi.fn> };
    expect(gradient.addColorStop.mock.calls).toEqual([
      [0, '#ffffff40'],
      [1, '#000000bf'],
    ]);
    expect(ctx.fillRect).toHaveBeenCalledWith(screen.x, screen.y, screen.width, screen.height);
  });

  it('samples the source for an adaptive phone fit gradient', () => {
    const ctx = context();
    const samplingContext = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray([255, 24, 24, 255, 255, 24, 24, 255, 24, 24, 255, 255, 24, 24, 255, 255]),
      })),
    };
    class FakeOffscreenCanvas {
      width = 0;
      height = 0;
      getContext = vi.fn(() => samplingContext);
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    try {
      const phoneSource = { videoWidth: 1_920, videoHeight: 1_080 } as unknown as CanvasImageSource;
      drawDecoratedMedia(ctx, {
        source: phoneSource,
        rect: { x: 0, y: 0, width: 415, height: 843 },
        appearance: appearance({
          frame: 'iphone-16-max',
          shadowSize: 'none',
          phoneFrameFill: { kind: 'adaptive' },
        }),
        title: 'Adaptive phone',
      });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(samplingContext.drawImage).toHaveBeenCalled();
    expect(samplingContext.getImageData).toHaveBeenCalled();
    expect(ctx.createLinearGradient).toHaveBeenCalled();
    const gradients = vi
      .mocked(ctx.createLinearGradient)
      .mock.results.map((result) => result.value as { addColorStop: ReturnType<typeof vi.fn> });
    expect(gradients.some((gradient) => gradient.addColorStop.mock.calls.length >= 2)).toBe(true);
  });

  it('keeps rendering a phone when adaptive sampling is unavailable', () => {
    const ctx = context();
    class NoContextOffscreenCanvas {
      width = 0;
      height = 0;
      getContext = vi.fn(() => null);
    }
    vi.stubGlobal('OffscreenCanvas', NoContextOffscreenCanvas);

    try {
      const phoneSource = { videoWidth: 1_920, videoHeight: 1_080 } as unknown as CanvasImageSource;
      expect(() =>
        drawDecoratedMedia(ctx, {
          source: phoneSource,
          rect: { x: 0, y: 0, width: 415, height: 843 },
          appearance: appearance({
            frame: 'iphone-16-max',
            shadowSize: 'none',
            phoneFrameFill: { kind: 'adaptive' },
          }),
          title: 'Adaptive fallback',
        }),
      ).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }

    expect(ctx.drawImage).toHaveBeenCalled();
    expect(adaptivePhoneFillColors(new Uint8ClampedArray())).toEqual(['#111827', '#312e81', '#0f172a']);
  });

  it('covers the phone screen with a filtered continuity copy before contained media', () => {
    const ctx = context();
    const rect = { x: 12, y: 8, width: 415, height: 843 };
    const screen = frameContentRect(rect, 'iphone-16-max');
    const sourceWidth = 1_920;
    const sourceHeight = 1_080;
    const phoneSource = { videoWidth: sourceWidth, videoHeight: sourceHeight } as unknown as CanvasImageSource;

    drawDecoratedMedia(ctx, {
      source: phoneSource,
      rect,
      appearance: appearance({
        frame: 'iphone-16-max',
        shadowSize: 'none',
        phoneFrameFill: { kind: 'continuity', blur: 32, brightness: 72 },
      }),
      title: 'Continuity phone',
    });

    const sourceDraws = vi.mocked(ctx.drawImage).mock.calls.filter(([drawn]) => drawn === phoneSource);
    expect(sourceDraws).toHaveLength(2);
    const [backgroundDraw, containedDraw] = sourceDraws;
    const destination = backgroundDraw?.length === 9 ? backgroundDraw.slice(5) : backgroundDraw?.slice(1);
    expect(destination).toHaveLength(4);
    const [x, y, width, height] = destination as number[];
    const destinationIsContained =
      x === screen.x && y === screen.y && width === screen.width && height === screen.height;
    if (destinationIsContained && backgroundDraw?.length === 9) {
      expect(backgroundDraw[3] / backgroundDraw[4]).toBeCloseTo(screen.width / screen.height, 5);
    } else {
      expect(x).toBeLessThanOrEqual(screen.x);
      expect(y).toBeLessThanOrEqual(screen.y);
      expect(x + width).toBeGreaterThanOrEqual(screen.x + screen.width);
      expect(y + height).toBeGreaterThanOrEqual(screen.y + screen.height);
      expect(width / height).toBeCloseTo(sourceWidth / sourceHeight, 5);
    }
    expect(containedDraw).toHaveLength(5);
    expect(ctx.filterWrites).toEqual(
      expect.arrayContaining([expect.stringContaining('blur(32px)'), expect.stringContaining('brightness(72%)')]),
    );
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
