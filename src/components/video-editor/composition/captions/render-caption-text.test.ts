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
});
