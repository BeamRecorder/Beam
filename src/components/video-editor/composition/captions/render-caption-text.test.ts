import { describe, expect, it, vi } from 'vitest';
import type { CaptionClip } from '~/media/shared/composition-types';
import { drawCaptionText } from './render-caption-text';

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
      color: '#ffffff',
      fontSize: 40,
      shadowColor: '#000000',
      shadowBlur: 0,
      placement: 'center',
      wrap: true,
      backdropBlur: 12,
      outlineColor: '#ff5a1f',
      outlineWidth: 6,
      extrusionDepth: 8,
    },
  },
});

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
      backdropBlur: 0,
      outlineWidth: 0,
      extrusionDepth: 0,
      shadowBlur: 0,
    },
  },
});

const context = () => {
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
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    rect: vi.fn(),
    drawImage: vi.fn(),
    font: '',
    textAlign: '',
    textBaseline: '',
    lineJoin: '',
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(value, 'filter', {
    configurable: true,
    get: () => filterWrites.at(-1) ?? 'none',
    set: (next: string) => {
      filterWrites.push(next);
      events.push(`filter:${next}`);
    },
  });
  return { value, filterWrites, events };
};

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
      clip: caption(),
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

    expect(ctx.value.fillText).toHaveBeenCalledWith('Ctrl', 500, 250);
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
});
