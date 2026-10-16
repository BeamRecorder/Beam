import { afterEach, expect, it, vi } from 'vitest';
import { drawGpuCursor, disposeGpuCursor } from './cursor-gpu-render';
import type { CursorGpuOptions } from '../cursor/cursor-gpu-types';
import type { Canvas2DContext } from '../canvas-types';
const state = vi.hoisted(() => ({ create: vi.fn(), dispose: vi.fn(), render: vi.fn() }));
vi.mock('../cursor/cursor-gpu-painter', () => ({
  CursorGpuPainter: class {
    constructor() {
      state.create();
    }
    render = state.render;
    dispose = state.dispose;
  },
}));
afterEach(() => {
  disposeGpuCursor();
  vi.clearAllMocks();
});
it('draws the bounded cursor surface and reuses its painter', () => {
  const context = { drawImage: vi.fn() } as unknown as Canvas2DContext;
  const surface = { canvas: {}, x: 20, y: 30, width: 40, height: 50 };
  state.render.mockReturnValue(surface);
  drawGpuCursor(context, {} as CursorGpuOptions);
  drawGpuCursor(context, {} as CursorGpuOptions);
  expect(state.create).toHaveBeenCalledOnce();
  expect(context.drawImage).toHaveBeenCalledWith(surface.canvas, 20, 30, 40, 50);
});
it('disposes once and allocates a fresh owner on the next render', () => {
  const context = { drawImage: vi.fn() } as unknown as Canvas2DContext;
  state.render.mockReturnValue({ canvas: {}, x: 0, y: 0, width: 1, height: 1 });
  drawGpuCursor(context, {} as CursorGpuOptions);
  disposeGpuCursor();
  disposeGpuCursor();
  expect(state.dispose).toHaveBeenCalledOnce();
  drawGpuCursor(context, {} as CursorGpuOptions);
  expect(state.create).toHaveBeenCalledTimes(2);
});
it('propagates GPU failures without drawing a substitute cursor', () => {
  const context = { drawImage: vi.fn() } as unknown as Canvas2DContext;
  state.render.mockImplementationOnce(() => {
    throw new Error('lost');
  });
  expect(() => drawGpuCursor(context, {} as CursorGpuOptions)).toThrow('lost');
  expect(context.drawImage).not.toHaveBeenCalled();
});
