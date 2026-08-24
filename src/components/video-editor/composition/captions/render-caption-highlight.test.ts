import { describe, expect, it, vi } from 'vitest';
import type { CaptionWordHighlightContent } from '~/media/shared/caption-highlight-types';
import type { CaptionClip } from '~/media/shared/composition-types';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import { drawCaptionText } from './render-caption-text';

const testCaptionStyle = (fontSize: number) => {
  const style = createDefaultCaptionStyle(fontSize);
  return { ...style, shape: { ...style.shape, opacity: 0, blur: 0 } };
};

const highlightClip = (overrides: Partial<CaptionClip['caption']['style']['wordHighlight']> = {}): CaptionClip => ({
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
      ...testCaptionStyle(40),
      textAlign: 'center',
      color: '#ffffff',
      shadowBlur: 0,
      shape: testCaptionStyle(40).shape,
      outlineWidth: 0,
      extrusionDepth: 0,
      placement: 'center',
      wordHighlight: {
        ...testCaptionStyle(40).wordHighlight,
        enabled: true,
        effect: 'none',
        ...overrides,
      },
    },
  },
});

const wordHighlight = (activeText = 'Hello', progress = 0.5): CaptionWordHighlightContent => ({
  words: [
    { text: activeText, active: true, progress },
    { text: activeText === 'Hello' ? 'world' : 'Hello', active: false, progress: 0 },
  ],
});

const context = () => {
  const fillWrites: Array<string | CanvasGradient | CanvasPattern> = [];
  const fontWrites: string[] = [];
  const alphaWrites: number[] = [];
  const linearGradients: Array<{ gradient: CanvasGradient; addColorStop: ReturnType<typeof vi.fn> }> = [];
  const radialGradients: Array<{ gradient: CanvasGradient; addColorStop: ReturnType<typeof vi.fn> }> = [];
  const value = {
    canvas: { width: 1_000, height: 500 },
    save: vi.fn(),
    restore: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 20 })),
    strokeText: vi.fn(),
    fillText: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    filter: 'none',
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
    createLinearGradient: vi.fn(() => {
      const addColorStop = vi.fn();
      const gradient = { addColorStop } as unknown as CanvasGradient;
      linearGradients.push({ gradient, addColorStop });
      return gradient;
    }),
    createRadialGradient: vi.fn(() => {
      const addColorStop = vi.fn();
      const gradient = { addColorStop } as unknown as CanvasGradient;
      radialGradients.push({ gradient, addColorStop });
      return gradient;
    }),
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(value, 'fillStyle', {
    configurable: true,
    get: () => fillWrites.at(-1) ?? '#ffffff',
    set: (next: string | CanvasGradient | CanvasPattern) => fillWrites.push(next),
  });
  Object.defineProperty(value, 'font', {
    configurable: true,
    get: () => fontWrites.at(-1) ?? '',
    set: (next: string) => fontWrites.push(next),
  });
  Object.defineProperty(value, 'globalAlpha', {
    configurable: true,
    get: () => alphaWrites.at(-1) ?? 1,
    set: (next: number) => alphaWrites.push(next),
  });
  return { value, fillWrites, fontWrites, alphaWrites, linearGradients, radialGradients };
};

const render = (effect: 'none' | 'pop' | 'jump' | 'pulse', progress: number) => {
  const ctx = context();
  drawCaptionText(ctx.value, {
    clip: highlightClip({ effect, intensity: 100 }),
    text: 'Hello world',
    wordHighlight: wordHighlight('Hello', progress),
    canvas: { width: 1_000, height: 500 },
    viewport: { x: 0, y: 0, width: 1_000, height: 500 },
  });
  return ctx;
};

describe('caption word highlight rendering', () => {
  it('renders the active word with a solid fill and dims inactive words', () => {
    const ctx = context();
    drawCaptionText(ctx.value, {
      clip: highlightClip({ color: '#facc15', inactiveOpacity: 35 }),
      text: 'Hello world',
      wordHighlight: wordHighlight(),
      canvas: { width: 1_000, height: 500 },
      viewport: { x: 0, y: 0, width: 1_000, height: 500 },
    });

    expect((ctx.value.fillText as ReturnType<typeof vi.fn>).mock.calls.map(([text]) => text)).toEqual([
      'Hello',
      'world',
    ]);
    expect(ctx.fillWrites).toEqual(['#facc15', '#ffffff']);
    expect(ctx.alphaWrites).toEqual([1, 0.35]);
  });

  it('renders linear and radial gradients with sorted stops and alpha', () => {
    const linear = context();
    drawCaptionText(linear.value, {
      clip: highlightClip({
        fill: 'gradient',
        gradient: {
          type: 'linear',
          angle: 45,
          stops: [
            { id: 'end', position: 1, color: '#ff0000', alpha: 1 },
            { id: 'start', position: 0, color: '#00ff00', alpha: 1 },
          ],
        },
      }),
      text: 'Hello world',
      wordHighlight: wordHighlight(),
      canvas: { width: 1_000, height: 500 },
      viewport: { x: 0, y: 0, width: 1_000, height: 500 },
    });
    expect(linear.linearGradients[0]?.addColorStop.mock.calls).toEqual([
      [0, '#00ff00'],
      [1, '#ff0000'],
    ]);
    expect(linear.fillWrites[0]).toBe(linear.linearGradients[0]?.gradient);

    const radial = context();
    drawCaptionText(radial.value, {
      clip: highlightClip({
        fill: 'gradient',
        gradient: {
          type: 'radial',
          stops: [
            { id: 'start', position: 0, color: '#000000', alpha: 0.5 },
            { id: 'end', position: 1, color: '#ffffff', alpha: 1 },
          ],
        },
      }),
      text: 'Hello world',
      wordHighlight: wordHighlight(),
      canvas: { width: 1_000, height: 500 },
      viewport: { x: 0, y: 0, width: 1_000, height: 500 },
    });
    expect(radial.radialGradients[0]?.addColorStop.mock.calls).toEqual([
      [0, 'rgba(0, 0, 0, 0.5)'],
      [1, '#ffffff'],
    ]);
    expect(radial.fillWrites[0]).toBe(radial.radialGradients[0]?.gradient);
  });

  it('keeps highlighted words on wrapped lines and preserves order', () => {
    const ctx = context();
    const clip = highlightClip({ color: '#22c55e' });
    clip.transform = { x: 0.1, y: 0.1, width: 0.16, height: 0.4 };
    drawCaptionText(ctx.value, {
      clip,
      text: 'one two three',
      wordHighlight: {
        words: [
          { text: 'one', active: false, progress: 0 },
          { text: 'two', active: true, progress: 0.5 },
          { text: 'three', active: false, progress: 0 },
        ],
      },
      canvas: { width: 1_000, height: 500 },
      viewport: { x: 0, y: 0, width: 1_000, height: 500 },
    });

    const calls = (ctx.value.fillText as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.map(([text]) => text).join(' ')).toBe('one two three');
    expect(calls[0]?.[2]).toBe(calls[1]?.[2]);
    expect(calls[2]?.[2]).toBeGreaterThan(calls[1]?.[2] as number);
    expect(ctx.fillWrites).toEqual(['#ffffff', '#22c55e', '#ffffff']);
  });

  it('applies pop, jump, and pulse only to the active word deterministically', () => {
    const none = render('none', 0.5);
    const pop = render('pop', 0.5);
    const jump = render('jump', 0.5);
    const pulse = render('pulse', 0.25);
    const sizes = (writes: string[]) =>
      writes.map((font) => Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 0)).filter((size) => size > 0);
    const noneCalls = (none.value.fillText as ReturnType<typeof vi.fn>).mock.calls;
    const jumpCalls = (jump.value.fillText as ReturnType<typeof vi.fn>).mock.calls;

    expect(jumpCalls[0]?.[2]).toBeLessThan(noneCalls[0]?.[2] as number);
    expect(jumpCalls[1]?.[2]).toBe(noneCalls[1]?.[2]);
    expect(Math.max(...sizes(pop.fontWrites))).toBeGreaterThan(Math.max(...sizes(none.fontWrites)));
    expect(Math.max(...sizes(pulse.fontWrites))).toBeGreaterThan(Math.max(...sizes(none.fontWrites)));
  });
});
