import { describe, expect, it, vi } from 'vitest';
import type { CaptionClip } from '~/media/shared/composition-types';
import type { CaptionShapeStyle } from '~/media/shared/caption-shape-types';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import { drawCaptionText } from './render-caption-text';

const defaultCaptionShape: CaptionShapeStyle = {
  preset: 'rounded',
  radius: 35,
  color: '#000000',
  opacity: 0,
  blur: 0,
  padding: 0,
};

const caption = (): CaptionClip => ({
  id: 'caption',
  kind: 'caption',
  name: 'Caption',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  caption: {
    type: 'text',
    sentences: [],
    style: {
      fontFamily: 'sans-serif',
      fontWeight: 800,
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'center',
      lineHeight: 1.2,
      letterSpacing: 0,
      color: '#ffffff',
      fontSize: 40,
      shadowColor: '#000000',
      shadowBlur: 0,
      placement: 'center',
      wrap: true,
      shape: { ...defaultCaptionShape },
      outlineColor: '#ff5a1f',
      outlineWidth: 6,
      extrusionDepth: 8,
      wordHighlight: createDefaultCaptionStyle(40).wordHighlight,
    },
  },
});

type CaptionStylePatch = Partial<Pick<CaptionClip['caption']['style'], 'outlineWidth' | 'extrusionDepth'>>;

const shapedCaption = (
  shapePatch: Partial<CaptionShapeStyle> = {},
  stylePatch: CaptionStylePatch = {},
): CaptionClip => {
  const clip = caption();
  clip.caption.style = {
    ...clip.caption.style,
    ...stylePatch,
    shape: {
      ...defaultCaptionShape,
      color: '#123456',
      opacity: 35,
      ...shapePatch,
    },
  };
  return clip;
};

const keyboardCaption = (): CaptionClip => ({
  ...caption(),
  caption: {
    type: 'keyboard',
    steps: [{ offsetMs: 0, modifiers: ['control'], key: 'k' }],
    followCursor: true,
    recordedPlatform: 'windows',
    sourceSessionId: 'session-1',
    style: {
      ...caption().caption.style,
      shape: { ...defaultCaptionShape },
      outlineWidth: 0,
      extrusionDepth: 0,
      shadowBlur: 0,
    },
  },
});

const context = () => {
  const fillStyleWrites: string[] = [];
  const alphaWrites: number[] = [];
  const filterWrites: string[] = [];
  const events: string[] = [];
  const value = {
    canvas: { width: 1_000, height: 500 },
    filter: 'none',
    save: vi.fn(),
    restore: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 20 })),
    strokeText: vi.fn(),
    fillText: vi.fn(() => events.push('text')),
    fillRect: vi.fn(),
    fill: vi.fn(() => events.push('fill')),
    beginPath: vi.fn(() => events.push('beginPath')),
    roundRect: vi.fn(() => events.push('roundRect')),
    clip: vi.fn(() => events.push('clip')),
    rect: vi.fn(() => events.push('rect')),
    drawImage: vi.fn(() => events.push('drawImage')),
    font: '',
    textAlign: '',
    textBaseline: '',
    lineJoin: '',
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    letterSpacing: '',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(value, 'fillStyle', {
    configurable: true,
    get: () => fillStyleWrites.at(-1) ?? '#ffffff',
    set: (next: string) => fillStyleWrites.push(next),
  });
  Object.defineProperty(value, 'globalAlpha', {
    configurable: true,
    get: () => alphaWrites.at(-1) ?? 1,
    set: (next: number) => alphaWrites.push(next),
  });
  Object.defineProperty(value, 'filter', {
    configurable: true,
    get: () => filterWrites.at(-1) ?? 'none',
    set: (next: string) => {
      filterWrites.push(next);
      events.push(`filter:${next}`);
    },
  });
  return { value, fillStyleWrites, alphaWrites, filterWrites, events };
};

const stubBackdropScratchCanvas = () => {
  const scratchContext = { drawImage: vi.fn() };
  vi.stubGlobal(
    'OffscreenCanvas',
    class OffscreenCanvas {
      readonly width: number;
      readonly height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return scratchContext;
      }
    },
  );
  return scratchContext;
};

const shapePath = (ctx: ReturnType<typeof context>) => {
  const rounded = (ctx.value.roundRect as ReturnType<typeof vi.fn>).mock.calls.at(-1);
  if (rounded) {
    const [x, y, width, height, radius] = rounded as [number, number, number, number, number];
    return { x, y, width, height, radius };
  }
  const rectangle = (ctx.value.rect as ReturnType<typeof vi.fn>).mock.calls.at(-1);
  if (!rectangle) throw new Error('Caption shape path was not rendered.');
  const [x, y, width, height] = rectangle as [number, number, number, number];
  return { x, y, width, height, radius: 0 };
};

const firstTextPosition = (ctx: ReturnType<typeof context>) => {
  const call = (ctx.value.fillText as ReturnType<typeof vi.fn>).mock.calls.filter((entry) => entry[0] === 'AA').at(-1);
  if (!call) throw new Error('Caption text was not rendered.');
  return { x: Number(call[1]), y: Number(call[2]) };
};

const renderShape = (shape: Partial<CaptionShapeStyle> = {}, style: CaptionStylePatch = {}) => {
  const ctx = context();
  drawCaptionText(ctx.value, {
    clip: shapedCaption(shape, style),
    text: 'AA',
    canvas: { width: 1_000, height: 500 },
    viewport: { x: 0, y: 0, width: 1_000, height: 500 },
  });
  return { ctx, path: shapePath(ctx) };
};

describe('caption shape backdrop', () => {
  it('fills a square shape with the configured color and opacity', () => {
    const ctx = context();
    drawCaptionText(ctx.value, {
      clip: shapedCaption(
        {
          preset: 'square',
          radius: 0,
          color: '#123456',
          opacity: 35,
          blur: 0,
        },
        { outlineWidth: 0, extrusionDepth: 0 },
      ),
      text: 'AA',
      canvas: { width: 1_000, height: 500 },
      viewport: { x: 0, y: 0, width: 1_000, height: 500 },
    });

    const path = shapePath(ctx);
    expect(path).toMatchObject({ x: 480, y: 230, width: 40, height: 40, radius: 0 });
    expect(ctx.value.fill).toHaveBeenCalledTimes(1);
    const hasConfiguredAlpha = ctx.alphaWrites.includes(0.35);
    const hasAlphaColor = ctx.fillStyleWrites.some(
      (value) => value === '#123456' || /^rgba\(18,\s*52,\s*86,\s*0\.35\)$/.test(value),
    );
    expect(hasAlphaColor).toBe(true);
    expect(hasConfiguredAlpha || ctx.fillStyleWrites.some((value) => /rgba\([^)]*,\s*0\.35\)$/.test(value))).toBe(true);
  });

  it('clips the blur to the selected rounded shape path before compositing it', () => {
    stubBackdropScratchCanvas();
    const ctx = context();
    drawCaptionText(ctx.value, {
      clip: shapedCaption(
        {
          preset: 'rounded',
          radius: 24,
          blur: 12,
        },
        { outlineWidth: 0, extrusionDepth: 0 },
      ),
      text: 'AA',
      canvas: { width: 1_000, height: 500 },
      viewport: { x: 0, y: 0, width: 1_000, height: 500 },
    });

    const path = shapePath(ctx);
    expect(path.radius).toBeGreaterThan(0);
    expect(path.radius).toBeLessThanOrEqual(Math.min(path.width, path.height) / 2);
    const pathIndex = Math.max(ctx.events.indexOf('roundRect'), ctx.events.indexOf('rect'));
    const clipIndex = ctx.events.indexOf('clip');
    const blurIndex = ctx.events.indexOf('filter:blur(12px)');
    const compositeIndex = ctx.events.indexOf('drawImage');
    expect(pathIndex).toBeGreaterThanOrEqual(0);
    expect(clipIndex).toBeGreaterThan(pathIndex);
    expect(blurIndex).toBeGreaterThan(clipIndex);
    expect(compositeIndex).toBeGreaterThan(blurIndex);
    vi.unstubAllGlobals();
  });

  it.each([
    ['pill', 50, true],
    ['custom', 30, true],
  ] as const)('maps the %s selector to its expected corner radius', (preset, radius, rounded) => {
    const { path } = renderShape({ preset, radius, blur: 0 });

    expect(rounded).toBe(true);
    if (preset === 'pill') expect(path.radius).toBe(Math.min(path.width, path.height) / 2);
    else expect(path.radius).toBe(Math.min(path.width, path.height) * (radius / 200));
  });

  it('keeps custom radius within the maximum even when the value reaches 100', () => {
    const { path } = renderShape({ preset: 'custom', radius: 100, blur: 0 });

    expect(path.radius).toBe(Math.min(path.width, path.height) / 2);
  });

  it('expands padding symmetrically while keeping the text and pill centers fixed', () => {
    const withoutPadding = renderShape({ preset: 'pill', padding: 0 }, { outlineWidth: 0, extrusionDepth: 0 });
    const withPadding = renderShape({ preset: 'pill', padding: 25 }, { outlineWidth: 0, extrusionDepth: 0 });
    const withoutCenter = {
      x: withoutPadding.path.x + withoutPadding.path.width / 2,
      y: withoutPadding.path.y + withoutPadding.path.height / 2,
    };
    const withCenter = {
      x: withPadding.path.x + withPadding.path.width / 2,
      y: withPadding.path.y + withPadding.path.height / 2,
    };
    const padding = 40 * 0.25;

    expect(withPadding.path.width - withoutPadding.path.width).toBeCloseTo(padding * 2);
    expect(withPadding.path.height - withoutPadding.path.height).toBeCloseTo(padding * 2);
    expect(withPadding.path.x - withoutPadding.path.x).toBeCloseTo(-padding);
    expect(withPadding.path.y - withoutPadding.path.y).toBeCloseTo(-padding);
    expect(withCenter).toEqual(withoutCenter);
    expect(firstTextPosition(withPadding.ctx)).toEqual(firstTextPosition(withoutPadding.ctx));
    expect(withCenter).toEqual({ x: 500, y: 250 });
  });

  it('centers a single-line shape on the text Y position even when line height is larger', () => {
    const ctx = context();
    const clip = shapedCaption({ preset: 'rounded', padding: 0 }, { outlineWidth: 0, extrusionDepth: 0 });
    clip.caption.style.lineHeight = 1.6;

    drawCaptionText(ctx.value, {
      clip,
      text: 'AA',
      canvas: { width: 1_000, height: 500 },
      viewport: { x: 0, y: 0, width: 1_000, height: 500 },
    });

    const path = shapePath(ctx);
    expect(path.y + path.height / 2).toBeCloseTo(firstTextPosition(ctx).y);
  });

  it('contains outline and extrusion symmetrically around the text bounds', () => {
    const { ctx, path } = renderShape(
      { preset: 'custom', radius: 24, padding: 0 },
      { outlineWidth: 6, extrusionDepth: 8 },
    );
    const text = firstTextPosition(ctx);
    const textWidth = 40;
    const textHeight = 40;
    const expansion = 6 + 8;

    expect(path.x).toBeCloseTo(text.x - textWidth / 2 - expansion);
    expect(path.y).toBeCloseTo(text.y - textHeight / 2 - expansion);
    expect(path.width).toBeCloseTo(textWidth + expansion * 2);
    expect(path.height).toBeCloseTo(textHeight + expansion * 2);
    expect(path.x + path.width / 2).toBeCloseTo(text.x);
    expect(path.y + path.height / 2).toBeCloseTo(text.y);
  });
});

describe('caption backdrop blur', () => {
  it('blurs the laid-out caption backdrop before drawing the text', () => {
    const scratchContext = { drawImage: vi.fn() };
    vi.stubGlobal(
      'OffscreenCanvas',
      class OffscreenCanvas {
        readonly width: number;
        readonly height: number;
        constructor(width: number, height: number) {
          this.width = width;
          this.height = height;
        }
        getContext() {
          return scratchContext;
        }
      },
    );
    const ctx = context();

    drawCaptionText(ctx.value, {
      clip: shapedCaption({ blur: 12 }),
      text: 'A caption',
      canvas: { width: 1_000, height: 500 },
      viewport: { x: 0, y: 0, width: 1_000, height: 500 },
    });

    expect(ctx.filterWrites).toContain('blur(12px)');
    const backdropIndex = ctx.events.indexOf('filter:blur(12px)');
    const textIndex = ctx.events.indexOf('text');
    expect(backdropIndex).toBeGreaterThanOrEqual(0);
    expect(textIndex).toBeGreaterThan(backdropIndex);
    vi.unstubAllGlobals();
  });

  it('renders keyboard runs with chord/sequence separators and their visual opacity', () => {
    const ctx = context();
    const alphaWrites: number[] = [];
    Object.defineProperty(ctx.value, 'globalAlpha', {
      configurable: true,
      get: () => alphaWrites.at(-1) ?? 1,
      set: (value: number) => alphaWrites.push(value),
    });

    drawCaptionText(ctx.value, {
      clip: keyboardCaption(),
      text: 'Ctrl + K → C',
      runs: [
        { text: 'Ctrl', fontScale: 1, opacity: 1, separator: 'none' },
        { text: ' + ', fontScale: 0.65, opacity: 0.55, separator: 'chord' },
        { text: 'K', fontScale: 1, opacity: 1, separator: 'none' },
        { text: ' → ', fontScale: 0.75, opacity: 0.65, separator: 'sequence' },
        { text: 'C', fontScale: 1, opacity: 1, separator: 'none' },
      ],
      canvas: { width: 1_000, height: 500 },
      viewport: { x: 0, y: 0, width: 1_000, height: 500 },
    });

    expect(ctx.value.fillText).toHaveBeenCalledWith(' + ', expect.any(Number), expect.any(Number));
    expect(ctx.value.fillText).toHaveBeenCalledWith(' → ', expect.any(Number), expect.any(Number));
    expect(alphaWrites).toEqual(expect.arrayContaining([1, 0.55, 0.65]));
  });

  it('keeps a fixed fallback transform when keyboard follow-cursor has no cursor position', () => {
    const ctx = context();
    drawCaptionText(ctx.value, {
      clip: keyboardCaption(),
      text: 'Ctrl',
      runs: [{ text: 'Ctrl', fontScale: 1, opacity: 1, separator: 'none' }],
      canvas: { width: 1_000, height: 500 },
      viewport: { x: 0, y: 0, width: 1_000, height: 500 },
    });

    expect(ctx.value.fillText).toHaveBeenCalledWith('Ctrl', 460, 250);
  });

  it('moves a keyboard caption next to the supplied cursor position', () => {
    const ctx = context();
    drawCaptionText(ctx.value, {
      clip: keyboardCaption(),
      text: 'Ctrl',
      runs: [{ text: 'Ctrl', fontScale: 1, opacity: 1, separator: 'none' }],
      cursorPosition: { x: 900, y: 400 },
      canvas: { width: 1_000, height: 500 },
      viewport: { x: 0, y: 0, width: 1_000, height: 500 },
    });

    const x = (ctx.value.fillText as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as number;
    expect(x).toBeGreaterThan(500);
  });

  it('uses the configured family, weight, style, and tracking', () => {
    const ctx = context();
    const clip = caption();
    clip.caption.style = {
      ...clip.caption.style,
      fontFamily: 'Aptos Display',
      fontWeight: 400,
      fontStyle: 'italic',
      letterSpacing: 2.5,
      shape: { ...clip.caption.style.shape, blur: 0 },
      outlineWidth: 0,
      extrusionDepth: 0,
    };

    drawCaptionText(ctx.value, {
      clip,
      text: 'A caption',
      canvas: { width: 1_000, height: 500 },
      viewport: { x: 0, y: 0, width: 1_000, height: 500 },
    });

    expect(ctx.value.font).toBe('italic 400 40px "Aptos Display"');
    expect(ctx.value.letterSpacing).toBe('2.5px');
  });

  it('applies tracking before measuring wrapped lines', () => {
    const ctx = context();
    const measuredSpacing: string[] = [];
    const measureText = ctx.value.measureText as unknown as ReturnType<typeof vi.fn>;
    measureText.mockImplementation((text: string) => {
      measuredSpacing.push(ctx.value.letterSpacing);
      const letterSpacing = Number.parseFloat(ctx.value.letterSpacing) || 0;
      return { width: text.length * 20 + Math.max(0, text.length - 1) * letterSpacing };
    });
    const clip = caption();
    clip.transform = { x: 0.1, y: 0.1, width: 0.2, height: 0.14 };
    clip.caption.style = {
      ...clip.caption.style,
      letterSpacing: 10,
      shape: { ...clip.caption.style.shape, blur: 0 },
      outlineWidth: 0,
      extrusionDepth: 0,
    };

    drawCaptionText(ctx.value, {
      clip,
      text: 'AAAA BBBB',
      canvas: { width: 1_000, height: 500 },
      viewport: { x: 0, y: 0, width: 1_000, height: 500 },
    });

    expect(measuredSpacing[0]).toBe('10px');
    expect(ctx.value.fillText).toHaveBeenCalledTimes(2);
  });

  it('aligns the backdrop bounds with left and right text anchors', () => {
    const scratchContext = { drawImage: vi.fn() };
    vi.stubGlobal(
      'OffscreenCanvas',
      class OffscreenCanvas {
        readonly width: number;
        readonly height: number;
        constructor(width: number, height: number) {
          this.width = width;
          this.height = height;
        }
        getContext() {
          return scratchContext;
        }
      },
    );

    for (const [textAlign, expectedX] of [
      ['left', 108],
      ['right', 852],
    ] as const) {
      const ctx = context();
      const clip = caption();
      clip.caption.style = {
        ...clip.caption.style,
        textAlign,
        shape: { ...clip.caption.style.shape, blur: 4 },
        outlineWidth: 0,
        extrusionDepth: 0,
      };

      drawCaptionText(ctx.value, {
        clip,
        text: 'AA',
        canvas: { width: 1_000, height: 500 },
        viewport: { x: 0, y: 0, width: 1_000, height: 500 },
      });

      expect(ctx.value.roundRect).toHaveBeenCalledWith(
        expectedX,
        expect.any(Number),
        40,
        expect.any(Number),
        expect.any(Number),
      );
    }

    vi.unstubAllGlobals();
  });

  it('uses the configured alignment and line height for wrapped lines', () => {
    const ctx = context();
    const clip = caption();
    clip.caption.style = {
      ...clip.caption.style,
      textAlign: 'right',
      lineHeight: 1.5,
      shape: { ...clip.caption.style.shape, blur: 0 },
      outlineWidth: 0,
      extrusionDepth: 0,
    };

    drawCaptionText(ctx.value, {
      clip,
      text: 'first\nsecond',
      canvas: { width: 1_000, height: 500 },
      viewport: { x: 0, y: 0, width: 1_000, height: 500 },
    });

    const calls = (ctx.value.fillText as ReturnType<typeof vi.fn>).mock.calls;
    expect(ctx.value.textAlign).toBe('right');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[1]).toBe(892);
    expect(calls[1]?.[1]).toBe(892);
    expect((calls[1]?.[2] as number) - (calls[0]?.[2] as number)).toBeCloseTo(60);
  });

  it('draws a strikethrough using the rendered line width and alignment', () => {
    const ctx = context();
    const clip = caption();
    clip.caption.style = {
      ...clip.caption.style,
      textAlign: 'left',
      textDecoration: 'line-through',
      wrap: false,
      shape: { ...clip.caption.style.shape, blur: 0 },
      outlineWidth: 0,
      extrusionDepth: 0,
    };

    drawCaptionText(ctx.value, {
      clip,
      text: 'Strike',
      canvas: { width: 1_000, height: 500 },
      viewport: { x: 0, y: 0, width: 1_000, height: 500 },
    });

    expect(ctx.value.fillRect).toHaveBeenCalledTimes(1);
    const [x, , width, height] = (ctx.value.fillRect as ReturnType<typeof vi.fn>).mock.calls[0] as [
      number,
      number,
      number,
      number,
    ];
    expect(x).toBe(108);
    expect(width).toBe(120);
    expect(height).toBeGreaterThan(0);
  });

  it.each([
    ['plain text', () => ({ clip: shapedCaption({ opacity: 50 }), text: 'AA' })],
    [
      'word-highlight text',
      () => ({
        clip: shapedCaption({ opacity: 50 }),
        text: 'Hello world',
        wordHighlight: {
          words: [
            { text: 'Hello', active: true, progress: 0.5 },
            { text: 'world', active: false, progress: 0 },
          ],
        },
      }),
    ],
    [
      'keyboard runs',
      () => ({
        clip: {
          ...keyboardCaption(),
          caption: {
            ...keyboardCaption().caption,
            style: { ...keyboardCaption().caption.style, shape: { ...defaultCaptionShape, opacity: 50 } },
          },
        },
        text: 'Ctrl + K',
        runs: [
          { text: 'Ctrl', fontScale: 1, opacity: 1, separator: 'none' as const },
          { text: ' + ', fontScale: 0.65, opacity: 0.55, separator: 'chord' as const },
          { text: 'K', fontScale: 1, opacity: 1, separator: 'none' as const },
        ],
      }),
    ],
  ] as const)('keeps the caption shape while hiding %s glyphs during inline editing', (_label, createOptions) => {
    const ctx = context();
    const options = createOptions();

    drawCaptionText(ctx.value, {
      ...options,
      hideText: true,
      canvas: { width: 1_000, height: 500 },
      viewport: { x: 0, y: 0, width: 1_000, height: 500 },
    });

    expect(ctx.value.roundRect).toHaveBeenCalled();
    expect(ctx.value.fill).toHaveBeenCalled();
    expect(ctx.value.fillText).not.toHaveBeenCalled();
  });
});
