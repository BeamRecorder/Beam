import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bitmap, requestFixture } from './export-test-support';
import type { Canvas2DContext } from '~/types/canvas';
const dependencies = vi.hoisted(() => ({
  draw: vi.fn(),
  fonts: vi.fn(),
  release: vi.fn(),
  assets: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../../screenshot-draw', () => ({ drawScreenshot: dependencies.draw }));
vi.mock('~/media/shared/element-fonts', () => ({ loadElementFonts: dependencies.fonts }));
vi.mock('../../../composition/render-composited-layer', () => ({
  releaseCompositedLayerSurface: dependencies.release,
}));
vi.mock('../screenshot-export-images', () => ({
  createScreenshotExportImages: () => ({ assets: dependencies.assets, dispose: dependencies.dispose }),
}));
import { renderScreenshotExport, runScreenshotExport } from '../screenshot-export-worker';

let context: Canvas2DContext | null;
let surfaces: Array<{ width: number; height: number }>;
let encode: ReturnType<typeof vi.fn>;
let bytes: ArrayBuffer;
beforeEach(() => {
  vi.clearAllMocks();
  surfaces = [];
  bytes = new ArrayBuffer(8);
  context = {} as Canvas2DContext;
  encode = vi.fn(async (options) => ({ type: options.type, arrayBuffer: async () => bytes }));
  dependencies.draw.mockReset();
  dependencies.fonts.mockReset().mockResolvedValue(undefined);
  dependencies.assets
    .mockReset()
    .mockResolvedValue({ image: bitmap(), background: null, logo: null, width: 1000, height: 500 });
  dependencies.dispose.mockResolvedValue(undefined);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        surfaces.push(this);
      }
      getContext() {
        return context;
      }
      convertToBlob = encode;
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
it.each(['png', 'webp'] as const)(
  'renders %s with the shared compositor and closes all job resources',
  async (format) => {
    const request = requestFixture();
    request.state.format = format;
    const logo = bitmap();
    request.decorations.logo = logo;
    request.decorations.cursors = new Map([['cursor', { image: logo, asset: { id: 'cursor' } as never }]]);
    await expect(renderScreenshotExport(request)).resolves.toBe(bytes);
    expect(dependencies.draw).toHaveBeenCalledWith(context, request.state, expect.any(Object), 1000, 500);
    expect(encode).toHaveBeenCalledWith({ type: `image/${format}`, quality: 0.9 });
    expect(dependencies.release).toHaveBeenCalledWith(context);
    expect(dependencies.dispose).toHaveBeenCalledOnce();
    expect(surfaces[0]).toEqual(expect.objectContaining({ width: 0, height: 0 }));
    expect(logo.close).toHaveBeenCalledOnce();
  },
);
it.each([-1, 2])('clamps quality at %s', async (quality) => {
  const request = requestFixture();
  request.state.quality = quality;
  await renderScreenshotExport(request);
  expect(encode).toHaveBeenCalledWith({ type: 'image/png', quality: quality < 0 ? 0 : 1 });
});
it('rejects oversized dimensions without font loading or rendering', async () => {
  const request = requestFixture();
  request.state.canvas.width = 20000;
  await expect(renderScreenshotExport(request)).rejects.toThrow('Invalid screenshot export dimensions.');
  expect(dependencies.fonts).not.toHaveBeenCalled();
  expect(dependencies.dispose).toHaveBeenCalledOnce();
});
it.each(['fonts', 'assets', 'draw', 'encode', 'bytes'])('releases resources after a %s failure', async (phase) => {
  const request = requestFixture(),
    logo = bitmap();
  request.decorations.logo = logo;
  const reason = new Error('failure');
  if (phase === 'fonts') dependencies.fonts.mockRejectedValueOnce(reason);
  if (phase === 'assets') dependencies.assets.mockRejectedValueOnce(reason);
  if (phase === 'draw')
    dependencies.draw.mockImplementationOnce(() => {
      throw reason;
    });
  if (phase === 'encode') encode.mockRejectedValueOnce(reason);
  if (phase === 'bytes')
    encode.mockResolvedValueOnce({
      type: 'image/png',
      arrayBuffer: async () => {
        throw reason;
      },
    });
  await expect(renderScreenshotExport(request)).rejects.toThrow('failure');
  expect(dependencies.dispose).toHaveBeenCalledOnce();
  expect(logo.close).toHaveBeenCalledOnce();
  expect(surfaces.every((surface) => surface.width === 0 && surface.height === 0)).toBe(true);
});
it('reports an unavailable context and a mismatched encoder format', async () => {
  context = null;
  await expect(renderScreenshotExport(requestFixture())).rejects.toThrow('Screenshot rendering is unavailable.');
  context = {} as Canvas2DContext;
  encode.mockResolvedValueOnce({ type: 'image/jpeg' });
  await expect(renderScreenshotExport(requestFixture())).rejects.toThrow('PNG encoding is unavailable.');
});
it('transfers successful bytes and exposes errors instead of a fake success', async () => {
  const post = vi.fn();
  await runScreenshotExport(requestFixture(), post);
  expect(post).toHaveBeenLastCalledWith({ bytes }, [bytes]);
  dependencies.draw.mockImplementationOnce(() => {
    throw new Error('bad shape');
  });
  await runScreenshotExport(requestFixture(), post);
  expect(post).toHaveBeenLastCalledWith({ error: 'bad shape' }, []);
  dependencies.draw.mockImplementationOnce(() => {
    throw 'invalid';
  });
  await runScreenshotExport(requestFixture(), post);
  expect(post).toHaveBeenLastCalledWith({ error: 'invalid' }, []);
});
