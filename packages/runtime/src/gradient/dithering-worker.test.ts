import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { DEFAULT_DITHERING_RECIPE } from '@beam/engine';
import type { CpuEffectRequest, CpuEffectReply } from './cpu-effect-types';
let host: {
  onmessage: ((event: MessageEvent<CpuEffectRequest>) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
};
let context: {
  drawImage: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
  putImageData: ReturnType<typeof vi.fn>;
};
let output: ImageBitmap;
beforeEach(async () => {
  vi.resetModules();
  host = { onmessage: null, postMessage: vi.fn() };
  output = { close: vi.fn() } as unknown as ImageBitmap;
  context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([188, 188, 188, 64]), width: 1, height: 1 })),
    putImageData: vi.fn(),
  };
  vi.stubGlobal('self', host);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width = 1;
      height = 1;
      getContext() {
        return context;
      }
      transferToImageBitmap() {
        return output;
      }
    },
  );
  await import('./dithering.worker');
});
afterEach(() => vi.unstubAllGlobals());
const send = (recipe = DEFAULT_DITHERING_RECIPE) => {
  const source = { width: 1, height: 1, close: vi.fn() } as unknown as ImageBitmap;
  host.onmessage!({ data: { source, recipe, pixelRatio: 1 } } as MessageEvent<CpuEffectRequest>);
  return source;
};
it('diffuses in the worker and transfers an exact alpha-preserving bitmap', () => {
  const source = send();
  expect(context.putImageData.mock.calls[0]![0].data[3]).toBe(64);
  expect(host.postMessage).toHaveBeenCalledWith({ bitmap: output }, { transfer: [output] });
  expect(source.close).toHaveBeenCalledOnce();
});
it('reports invalid recipes and closes the input bitmap', () => {
  const source = send({ ...DEFAULT_DITHERING_RECIPE, blockSize: 0 });
  expect((host.postMessage.mock.calls[0]![0] as CpuEffectReply).error).toContain('recipe');
  expect(source.close).toHaveBeenCalledOnce();
});
it('reports pixel access failures without returning an incomplete bitmap', () => {
  context.getImageData.mockImplementation(() => {
    throw new Error('pixel failure');
  });
  send();
  expect(host.postMessage).toHaveBeenCalledWith({ error: 'Error: pixel failure' });
});
it('reports unavailable 2D contexts', () => {
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return null;
      }
    },
  );
  send();
  expect(host.postMessage).toHaveBeenCalledWith({ error: 'Error: JJN worker rendering is unavailable.' });
});
