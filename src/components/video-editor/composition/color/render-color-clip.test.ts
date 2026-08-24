import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColorClip } from '~/media/shared/composition-types';
import { applyBlurEffect } from '../effects/blur-effect';
import { drawColorClip } from './render-color-clip';

vi.mock('../effects/blur-effect', () => ({
  applyBlurEffect: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

const colorClip = (fill: ColorClip['fill'], transform = { x: 0, y: 0, width: 1, height: 1 }): ColorClip => ({
  id: 'color',
  kind: 'color',
  name: 'Color',
  assetId: '',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform,
  fill,
});

const context = () => {
  const fillWrites: unknown[] = [];
  const alphaWrites: number[] = [];
  const linearGradients: Array<{ args: unknown[]; addColorStop: ReturnType<typeof vi.fn> }> = [];
  const radialGradients: Array<{ args: unknown[]; addColorStop: ReturnType<typeof vi.fn> }> = [];
  const value = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    filter: 'none',
    globalAlpha: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillStyle: '',
    createLinearGradient: vi.fn((...args: unknown[]) => {
      const addColorStop = vi.fn();
      const gradient = { addColorStop } as unknown as CanvasGradient;
      linearGradients.push({ args, addColorStop });
      return gradient;
    }),
    createRadialGradient: vi.fn((...args: unknown[]) => {
      const addColorStop = vi.fn();
      const gradient = { addColorStop } as unknown as CanvasGradient;
      radialGradients.push({ args, addColorStop });
      return gradient;
    }),
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(value, 'fillStyle', {
    configurable: true,
    get: () => fillWrites.at(-1),
    set: (next: unknown) => fillWrites.push(next),
  });
  let globalAlpha = 1;
  Object.defineProperty(value, 'globalAlpha', {
    configurable: true,
    get: () => globalAlpha,
    set: (next: number) => {
      globalAlpha = next;
      alphaWrites.push(next);
    },
  });
  return { value, fillWrites, alphaWrites, linearGradients, radialGradients };
};

describe('drawColorClip', () => {
  it('renders a solid fill using the clip transform within the viewport', () => {
    const ctx = context();

    drawColorClip(
      ctx.value,
      colorClip({ kind: 'color', color: '#123456' }, { x: 0.1, y: 0.2, width: 0.5, height: 0.4 }),
      { x: 10, y: 20, width: 200, height: 100 },
    );

    expect(ctx.fillWrites).toEqual(['#123456']);
    expect(ctx.value.roundRect).toHaveBeenCalledWith(30, 40, 100, 40, 0);
    expect(ctx.value.fill).toHaveBeenCalledOnce();
    expect(ctx.value.save).toHaveBeenCalledOnce();
    expect(ctx.value.restore).toHaveBeenCalledOnce();
  });

  it('applies opacity, rounded corners, and a proportional shadow', () => {
    const ctx = context();

    drawColorClip(
      ctx.value,
      colorClip({ kind: 'color', color: '#123456' }, { x: 0.1, y: 0.2, width: 0.5, height: 0.4 }),
      { x: 10, y: 20, width: 200, height: 100 },
    );
    drawColorClip(
      ctx.value,
      {
        ...colorClip({ kind: 'color', color: '#123456' }, { x: 0.1, y: 0.2, width: 0.5, height: 0.4 }),
        opacityEnabled: true,
        opacity: 42,
        cornerRadius: 50,
        shadowSize: 'custom',
        shadowBlur: 40,
      },
      { x: 10, y: 20, width: 200, height: 100 },
    );

    expect(ctx.alphaWrites).toContain(0.42);
    expect(ctx.value.roundRect).toHaveBeenLastCalledWith(30, 40, 100, 40, 50 * (100 / 1080));
    expect(ctx.value.shadowColor).toBe('#000000');
    expect(ctx.value.shadowBlur).toBeCloseTo(40 * (100 / 1080));
    expect(ctx.value.shadowOffsetX).toBe(0);
    expect(ctx.value.shadowOffsetY).toBe(0);
  });

  it('delegates backdrop blur to the shared blur renderer with the color layer mask', () => {
    const ctx = context();
    const rect = { x: 30, y: 40, width: 100, height: 40 };

    drawColorClip(
      ctx.value,
      {
        ...colorClip({ kind: 'color', color: '#123456' }, { x: 0.1, y: 0.2, width: 0.5, height: 0.4 }),
        cornerRadius: 50,
        backdropBlurEnabled: true,
        backdropBlur: 64,
      },
      { x: 10, y: 20, width: 200, height: 100 },
    );

    expect(applyBlurEffect).toHaveBeenCalledWith(
      ctx.value,
      expect.objectContaining({
        kind: 'blur',
        shape: 'rectangle',
        mode: 'blur',
        strength: 64,
        cornerRadius: expect.any(Number),
      }),
      rect,
    );
  });

  it.each([
    ['disabled', { backdropBlurEnabled: false, backdropBlur: 64 }],
    ['zero-valued', { backdropBlurEnabled: true, backdropBlur: 0 }],
  ] as const)('does not calculate backdrop blur when it is %s', (_label, style) => {
    const ctx = context();

    drawColorClip(
      ctx.value,
      {
        ...colorClip({ kind: 'color', color: '#123456' }),
        ...style,
      },
      { x: 0, y: 0, width: 200, height: 100 },
    );

    expect(applyBlurEffect).not.toHaveBeenCalled();
  });

  it('keeps legacy clips visually unchanged when appearance fields are absent', () => {
    const ctx = context();

    drawColorClip(ctx.value, colorClip({ kind: 'color', color: '#123456' }), {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });

    expect(ctx.value.globalAlpha).toBe(1);
    expect(ctx.value.roundRect).toHaveBeenCalledWith(0, 0, 200, 100, 0);
    expect(ctx.value.shadowColor).toBe('transparent');
    expect(ctx.value.shadowBlur).toBe(0);
    expect(applyBlurEffect).not.toHaveBeenCalled();
  });

  it('renders a linear gradient with its angle and ordered alpha stops', () => {
    const ctx = context();

    drawColorClip(
      ctx.value,
      colorClip({
        kind: 'gradient',
        gradient: {
          type: 'linear',
          angle: 0,
          stops: [
            { id: 'start', position: 0, color: '#ff0000', alpha: 1 },
            { id: 'end', position: 1, color: '#0000ff', alpha: 0.5 },
          ],
        },
      }),
      { x: 0, y: 0, width: 200, height: 100 },
    );

    expect(ctx.linearGradients[0]?.args).toEqual([100, 100, 100, 0]);
    expect(ctx.linearGradients[0]?.addColorStop.mock.calls).toEqual([
      [0, '#ff0000ff'],
      [1, '#0000ff80'],
    ]);
    expect(ctx.value.roundRect).toHaveBeenCalledWith(0, 0, 200, 100, 0);
    expect(ctx.radialGradients).toHaveLength(0);
  });

  it('renders a radial gradient with centered geometry, stops, and alpha', () => {
    const ctx = context();

    drawColorClip(
      ctx.value,
      colorClip({
        kind: 'gradient',
        gradient: {
          type: 'radial',
          angle: 180,
          stops: [
            { id: 'inner', position: 0, color: '#ffffff', alpha: 0.25 },
            { id: 'outer', position: 1, color: '#000000', alpha: 0.75 },
          ],
        },
      }),
      { x: 10, y: 20, width: 200, height: 100 },
    );

    expect(ctx.radialGradients[0]?.args).toEqual([110, 70, 0, 110, 70, 100]);
    expect(ctx.radialGradients[0]?.addColorStop.mock.calls).toEqual([
      [0, '#ffffff40'],
      [1, '#000000bf'],
    ]);
    expect(ctx.value.roundRect).toHaveBeenCalledWith(10, 20, 200, 100, 0);
    expect(ctx.linearGradients).toHaveLength(0);
  });
});
