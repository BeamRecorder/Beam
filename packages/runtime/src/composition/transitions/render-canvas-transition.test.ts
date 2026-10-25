import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drawCanvasTransitionFrame } from './render-canvas-transition';
import { context } from '../../rendering/tests/render.test-support';
import type { ClipTransitionState } from '@beam/engine/shared/clip-transitions';

const gpu = vi.hoisted(() => ({ draw: vi.fn() }));
vi.mock('./transition-effects', () => ({ drawTransitionEffect: gpu.draw }));
beforeEach(() => {
  gpu.draw.mockReset();
});
const frame = { x: 20, y: 10, width: 160, height: 80 },
  size = { width: 200, height: 100 };
const source = {} as CanvasImageSource;
const state: ClipTransitionState = { opacity: 1, translateX: 0, translateY: 0, scale: 1, blur: 0 };
describe('completed canvas transition painter', () => {
  it('uses the actual output rectangle for GPU masks inside a letterboxed preview', () => {
    const ctx = context(),
      effect = { preset: { kind: 'circle-reveal' as const }, progress: 0.5, edge: 'entry' as const };
    drawCanvasTransitionFrame(ctx, source, size, frame, { ...state, effect }, '#112233');
    expect(ctx.fillRect).toHaveBeenCalledWith(20, 10, 160, 80);
    expect(gpu.draw).toHaveBeenCalledWith(ctx, source, { x: 0, y: 0, ...size }, effect, {
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
    });
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
  it('restores its destination when a GPU paint fails', () => {
    gpu.draw.mockImplementation(() => {
      throw new Error('lost context');
    });
    const ctx = context();
    expect(() =>
      drawCanvasTransitionFrame(
        ctx,
        source,
        size,
        frame,
        { ...state, effect: { preset: { kind: 'split' }, progress: 0.5, edge: 'exit' } },
        '#000000',
      ),
    ).toThrow('lost context');
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
  it('retains legacy scaling, translation, blur and alpha without a GPU pass', () => {
    const ctx = context();
    ctx.globalAlpha = 0.5;
    drawCanvasTransitionFrame(
      ctx,
      source,
      size,
      frame,
      { opacity: 0.4, translateX: 0.1, translateY: -0.2, scale: 0.9, blur: 12 },
      '#000000',
    );
    expect(ctx.globalAlpha).toBe(0.2);
    expect(ctx.translate).toHaveBeenCalledWith(16, -16);
    expect(ctx.scale).toHaveBeenCalledWith(0.9, 0.9);
    expect(ctx.filter).toBe(`blur(${(12 * 80) / 1080}px)`);
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 0, 0, 200, 100);
    expect(gpu.draw).not.toHaveBeenCalled();
  });
  it('leaves the legacy crisp pass unfiltered', () => {
    const ctx = context();
    drawCanvasTransitionFrame(ctx, source, size, frame, state, '#000000');
    expect(ctx.filter).toBe('none');
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
});
