import { afterEach, expect, it, vi } from 'vitest';
import { drawGpuCursor, disposeGpuCursor } from './cursor-gpu-render';
import type { CursorGpuOptions } from '../cursor/cursor-gpu-types';
import type { Canvas2DContext } from '../canvas-types';
const state = vi.hoisted(() => ({
  create: vi.fn(),
  dispose: vi.fn(),
  render: vi.fn(),
  flatCreate: vi.fn(),
  flatDispose: vi.fn(),
  flatRender: vi.fn(),
}));
vi.mock('../cursor/cursor-gpu-painter', () => ({
  CursorGpuPainter: class {
    constructor() {
      state.create();
    }
    render = state.render;
    dispose = state.dispose;
  },
}));
vi.mock('../cursor/flat-cursor-exposure', () => ({
  FlatCursorExposurePainter: class {
    constructor(rasterizer: unknown) {
      state.flatCreate(rasterizer);
    }
    render = state.flatRender;
    dispose = state.flatDispose;
  },
}));
afterEach(() => {
  disposeGpuCursor();
  vi.clearAllMocks();
});
it('draws the bounded cursor surface and reuses its painter', () => {
  const context = { drawImage: vi.fn() } as unknown as Canvas2DContext;
  const surface = { canvas: {}, x: 20, y: 30, width: 40, height: 50 };
  state.flatRender.mockReturnValue(surface);
  drawGpuCursor(context, {} as CursorGpuOptions);
  drawGpuCursor(context, {} as CursorGpuOptions);
  expect(state.create).toHaveBeenCalledOnce();
  expect(state.flatCreate).toHaveBeenCalledOnce();
  expect(state.render).not.toHaveBeenCalled();
  expect(context.drawImage).toHaveBeenCalledWith(surface.canvas, 20, 30, 40, 50);
});
it('disposes once and allocates a fresh owner on the next render', () => {
  const context = { drawImage: vi.fn() } as unknown as Canvas2DContext;
  state.flatRender.mockReturnValue({
    canvas: {},
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  drawGpuCursor(context, {} as CursorGpuOptions);
  disposeGpuCursor();
  disposeGpuCursor();
  expect(state.dispose).toHaveBeenCalledOnce();
  expect(state.flatDispose).toHaveBeenCalledOnce();
  drawGpuCursor(context, {} as CursorGpuOptions);
  expect(state.create).toHaveBeenCalledTimes(2);
});
it('propagates GPU failures without drawing a substitute cursor', () => {
  const context = { drawImage: vi.fn() } as unknown as Canvas2DContext;
  state.flatRender.mockImplementationOnce(() => {
    throw new Error('lost');
  });
  expect(() => drawGpuCursor(context, {} as CursorGpuOptions)).toThrow('lost');
  expect(context.drawImage).not.toHaveBeenCalled();
});
it('retains the existing GPU exposure path for 3D while sharing its artwork with flat stamps', () => {
  const context = { drawImage: vi.fn() } as unknown as Canvas2DContext;
  state.render.mockReturnValue({
    canvas: {},
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  });
  drawGpuCursor(context, {
    volume: { pitch: 0.2, yaw: 0, height: 0.3 },
  } as CursorGpuOptions);
  expect(state.render).toHaveBeenCalledOnce();
  expect(state.flatCreate).not.toHaveBeenCalled();
  state.flatRender.mockReturnValue({
    canvas: {},
    x: 1,
    y: 2,
    width: 10,
    height: 10,
  });
  drawGpuCursor(context, {} as CursorGpuOptions);
  expect(state.create).toHaveBeenCalledOnce();
  expect(state.flatCreate).toHaveBeenCalledOnce();
  expect(context.drawImage).toHaveBeenLastCalledWith(expect.anything(), 1, 2, 10, 10);
});
