import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BlickWaveformWorkerRequest, BlickWaveformRendererOptions } from '../blick-waveform-types';
const gpu = vi.hoisted(() => ({ draw: vi.fn(), dispose: vi.fn() }));
const acquire = vi.hoisted(() => vi.fn((_options: BlickWaveformRendererOptions) => gpu));
vi.mock('../blick-waveform-renderer', () => ({
  acquireBlickWaveformRenderer: acquire,
}));
const bitmap = { close: vi.fn() };
class Canvas {
  transferToImageBitmap = vi.fn(() => bitmap);
}
const request: BlickWaveformWorkerRequest = {
  id: 4,
  width: 100,
  height: 40,
  pixelRatio: 2,
  data: {
    bars: [1],
    bands: new Float32Array(4),
    loadingSegments: [],
    sourceDurationSeconds: 1,
  },
};
const setup = async () => {
  vi.resetModules();
  const scope = {
    onmessage: null as ((event: MessageEvent<BlickWaveformWorkerRequest>) => void) | null,
    postMessage: vi.fn(),
  };
  vi.stubGlobal('self', scope);
  vi.stubGlobal('OffscreenCanvas', Canvas);
  await import('../blick-waveform.worker');
  return scope;
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe('GPU waveform worker entry', () => {
  it('lazily shares one GPU renderer and transfers the rendered bitmap with the current pixel ratio', async () => {
    const scope = await setup();
    expect(acquire).not.toHaveBeenCalled();
    scope.onmessage?.({
      data: request,
    } as MessageEvent<BlickWaveformWorkerRequest>);
    const options = acquire.mock.calls[0]![0]!;
    expect(options.pixelRatio()).toBe(2);
    expect(options.createCanvas()).toBeInstanceOf(Canvas);
    expect(gpu.draw).toHaveBeenCalledWith(expect.any(Canvas), request.data, 100, 40);
    expect(scope.postMessage).toHaveBeenCalledWith({ id: 4, bitmap }, [bitmap]);
    scope.onmessage?.({
      data: { ...request, pixelRatio: 1 },
    } as MessageEvent<BlickWaveformWorkerRequest>);
    expect(options.pixelRatio()).toBe(1);
    expect(acquire).toHaveBeenCalledOnce();
  });
  it.each([new Error('GPU unavailable'), 'GPU unavailable'])(
    'reports rendering failures without pretending the image succeeded',
    async (cause) => {
      const scope = await setup();
      gpu.draw.mockImplementationOnce(() => {
        throw cause;
      });
      scope.onmessage?.({
        data: request,
      } as MessageEvent<BlickWaveformWorkerRequest>);
      expect(scope.postMessage).toHaveBeenCalledWith({
        id: 4,
        error: cause instanceof Error ? cause.message : 'The audio waveform could not be rendered.',
      });
    },
  );
});
