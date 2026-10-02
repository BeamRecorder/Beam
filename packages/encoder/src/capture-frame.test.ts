// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createRenderDocument } from '@beam/engine';
import { captureCompositionFrame } from './capture-frame';
const mocks = vi.hoisted(() => ({ open: vi.fn(), images: vi.fn(), fonts: vi.fn(), render: vi.fn(), dispose: vi.fn() }));
vi.mock('./mediabunny/export-worker-assets', () => ({ openExportAssets: mocks.open }));
vi.mock('./mediabunny/export-images', () => ({ loadExportImages: mocks.images }));
vi.mock('./mediabunny/export-worker-fonts', () => ({ loadExportFonts: mocks.fonts }));
vi.mock('./mediabunny/export-worker-pipelines', () => ({ renderExportVideo: mocks.render }));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  const request = {
    projectName: 'Frame',
    format: 'webm' as const,
    preset: 'high' as const,
    snapshot: createRenderDocument(undefined, 64, 64, 25),
  };
  request.snapshot.duration = 1;
  mocks.open.mockResolvedValue({ dispose: mocks.dispose });
  mocks.images.mockResolvedValue(new Map());
  mocks.fonts.mockResolvedValue(undefined);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return {};
      }
      async convertToBlob() {
        return new Blob(['pixels']);
      }
    },
  );
  mocks.render.mockImplementation(async (...args: unknown[]) => {
    await (args[5] as { addVideo(): Promise<void> }).addVideo();
    (args[5] as { closeVideo(): void }).closeVideo();
  });
  return request;
}
it('captures the requested frame interval using the shared composition pipeline and returns its actual frame time', async () => {
  const result = await captureCompositionFrame(setup(), 121, new Map(), new AbortController().signal);
  expect(result.timeMs).toBe(120);
  expect(new TextDecoder().decode(result.bytes)).toBe('pixels');
  expect(mocks.render.mock.calls[0]?.[9]).toEqual({ first: 3, end: 4 });
  expect(mocks.dispose).toHaveBeenCalledOnce();
});
it('rejects invalid or cancelled times before opening resources', async () => {
  const request = setup(),
    controller = new AbortController();
  for (const time of [-1, Infinity, 1000])
    await expect(captureCompositionFrame(request, time, new Map(), controller.signal)).rejects.toThrow('time');
  controller.abort();
  await expect(captureCompositionFrame(request, 0, new Map(), controller.signal)).rejects.toThrow();
  expect(mocks.open).not.toHaveBeenCalled();
});
it('disposes opened media and bitmaps on rendering, allocation or missing-output failures', async () => {
  const request = setup(),
    close = vi.fn(),
    signal = new AbortController().signal;
  mocks.images.mockImplementation(async (_request: unknown, owned: Map<string, { close(): void }>) => {
    owned.set('bitmap', { close });
    return new Map();
  });
  mocks.render.mockRejectedValueOnce(new Error('render failed'));
  await expect(captureCompositionFrame(request, 0, new Map(), signal)).rejects.toThrow('render failed');
  expect(close).toHaveBeenCalledOnce();
  mocks.render.mockResolvedValueOnce(undefined);
  await expect(captureCompositionFrame(request, 0, new Map(), signal)).rejects.toThrow('no frame');
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return null;
      }
    },
  );
  await expect(captureCompositionFrame(request, 0, new Map(), signal)).rejects.toThrow('canvas backend');
  expect(mocks.dispose).toHaveBeenCalledTimes(3);
});
