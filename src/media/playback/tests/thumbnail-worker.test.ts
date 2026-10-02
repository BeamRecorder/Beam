import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import type { ThumbnailWorkerResponse } from '../thumbnail-protocol';

const runtime = vi.hoisted(() => ({
  openMediaInput: vi.fn(),
  CanvasSink: vi.fn(),
  sinks: [] as unknown[],
}));

vi.mock('../../shared', () => ({ openMediaInput: runtime.openMediaInput }));
vi.mock('mediabunny', () => ({ CanvasSink: runtime.CanvasSink }));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const source = (assetId: string) => ({
  assetId,
  kind: 'video' as const,
  label: assetId,
  url: `project-media://asset/${assetId}`,
});

const request = (generation: number, assetId: string, width = 240) => ({
  type: 'request-frames' as const,
  generation,
  source: source(assetId),
  visibleTimes: [1],
  width,
});

const openedInput = (codec = 'avc1.640028') => {
  const track = {
    canDecode: vi.fn().mockResolvedValue(true),
    getDecoderConfig: vi.fn().mockResolvedValue({ codec }),
  };
  return {
    track,
    input: { getPrimaryVideoTrack: vi.fn().mockResolvedValue(track) },
    dispose: vi.fn(),
  };
};

const flush = flushPromises;

let workerSelf: {
  onmessage?: (event: MessageEvent<unknown>) => void;
  postMessage: ReturnType<typeof vi.fn>;
};

const messages = () => workerSelf.postMessage.mock.calls.map(([value]) => value as ThumbnailWorkerResponse);

beforeEach(async () => {
  vi.resetModules();
  runtime.openMediaInput.mockReset();
  runtime.CanvasSink.mockReset();
  runtime.sinks.length = 0;
  runtime.CanvasSink.mockImplementation(function CanvasSinkMock() {
    const sink = {
      canvasesAtTimestamps: vi.fn().mockReturnValue((async function* () {})()),
    };
    runtime.sinks.push(sink);
    return sink;
  });
  workerSelf = { onmessage: undefined, postMessage: vi.fn() };
  vi.stubGlobal('self', workerSelf);
  vi.stubGlobal('VideoDecoder', {
    isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
  });
  await import('../thumbnail.worker');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const send = (message: unknown) => workerSelf.onmessage?.({ data: message } as MessageEvent<unknown>);

describe('thumbnail worker decoder lifecycle', () => {
  it('ignores malformed messages without opening media or replying', async () => {
    send(null);
    send({ ...request(1, 'invalid'), width: 0 });
    await flush();
    expect(runtime.openMediaInput).not.toHaveBeenCalled();
    expect(messages()).toEqual([]);
  });

  it('reuses an unchanged source sink and releases it exactly once when cleared', async () => {
    const first = openedInput();
    const second = openedInput();
    runtime.openMediaInput.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    send(request(1, 'same'));
    await flush();
    send(request(2, 'same'));
    await flush();
    expect(runtime.CanvasSink).toHaveBeenCalledOnce();
    send({ type: 'clear', generation: 3 });
    send({ type: 'clear', generation: 4 });
    expect(first.dispose).toHaveBeenCalledOnce();
    send(request(5, 'same'));
    await flush();
    expect(runtime.CanvasSink).toHaveBeenCalledTimes(2);
    expect(second.dispose).not.toHaveBeenCalled();
  });

  it.each(['track', 'canDecode', 'config', 'support'] as const)(
    'disposes a candidate cleared while awaiting %s',
    async (stage) => {
      const opened = openedInput();
      const gate = deferred<unknown>();
      const stages = {
        track: { method: opened.input.getPrimaryVideoTrack, value: opened.track },
        canDecode: { method: opened.track.canDecode, value: true },
        config: { method: opened.track.getDecoderConfig, value: { codec: 'avc1.640028' } },
        support: { method: vi.mocked(VideoDecoder.isConfigSupported), value: { supported: true } },
      };
      if (stage === 'support') {
        vi.mocked(VideoDecoder.isConfigSupported).mockImplementationOnce(async () => {
          await gate.promise;
          return { supported: true };
        });
      } else {
        stages[stage].method.mockReturnValueOnce(gate.promise);
      }
      runtime.openMediaInput.mockResolvedValueOnce(opened);
      send(request(1, 'cancelled'));
      await flush();
      send({ type: 'clear', generation: 2 });
      gate.resolve(stages[stage].value);
      await flush();
      expect(opened.dispose).toHaveBeenCalledOnce();
      expect(runtime.CanvasSink).not.toHaveBeenCalled();
      expect(messages()).toEqual([{ type: 'batch-started', generation: 1 }]);
    },
  );

  it.each(['missing-track', 'unsupported-track', 'missing-webcodecs', 'missing-config'] as const)(
    'reports %s and releases its input',
    async (failure) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const opened = openedInput();
      if (failure === 'missing-track') opened.input.getPrimaryVideoTrack.mockResolvedValue(null);
      if (failure === 'unsupported-track') opened.track.canDecode.mockResolvedValue(false);
      if (failure === 'missing-webcodecs') vi.stubGlobal('VideoDecoder', undefined);
      if (failure === 'missing-config') opened.track.getDecoderConfig.mockResolvedValue(null);
      runtime.openMediaInput.mockResolvedValueOnce(opened);
      send(request(1, 'unsupported'));
      await flush();
      expect(opened.dispose).toHaveBeenCalledOnce();
      expect(runtime.CanvasSink).not.toHaveBeenCalled();
      expect(messages()).toContainEqual(expect.objectContaining({ type: 'error', generation: 1 }));
    },
  );

  it('reports non-Error rejections, but suppresses errors from a cleared source', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    runtime.openMediaInput.mockRejectedValueOnce('unavailable');
    send(request(1, 'broken'));
    await flush();
    expect(messages()).toContainEqual({ type: 'error', generation: 1, message: 'Thumbnail decoding failed.' });
    const gate = deferred<void>();
    runtime.openMediaInput.mockReturnValueOnce(
      gate.promise.then(() => {
        throw new Error('late failure');
      }),
    );
    send(request(2, 'stale'));
    await flush();
    send({ type: 'clear', generation: 3 });
    gate.resolve();
    await flush();
    expect(messages().filter((message) => message.type === 'error')).toHaveLength(1);
  });

  it('skips unavailable canvases, ignores extra frames and rejects HTML canvas conversion', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const canvas = { convertToBlob: vi.fn().mockResolvedValue(new Blob(['frame'])) };
    runtime.openMediaInput.mockResolvedValue(openedInput());
    runtime.CanvasSink.mockImplementationOnce(function () {
      return {
        canvasesAtTimestamps: () =>
          (async function* () {
            yield null;
            yield { canvas };
            yield { canvas };
          })(),
      };
    });
    send({ ...request(1, 'sparse'), visibleTimes: [0, 1] });
    await flush();
    expect(messages().filter((message) => message.type === 'frame-ready')).toHaveLength(1);
    expect(canvas.convertToBlob).toHaveBeenCalledWith({ type: 'image/jpeg', quality: 0.72 });
    runtime.CanvasSink.mockImplementationOnce(function () {
      return {
        canvasesAtTimestamps: () =>
          (async function* () {
            yield { canvas: document.createElement('canvas') };
          })(),
      };
    });
    send(request(2, 'html'));
    await flush();
    expect(messages()).toContainEqual({
      type: 'error',
      generation: 2,
      message: 'Thumbnail worker did not receive an OffscreenCanvas.',
    });
  });

  it('does not post a JPEG or later frames after clear during conversion', async () => {
    const gate = deferred<Blob>();
    const canvas = { convertToBlob: vi.fn().mockReturnValue(gate.promise) };
    runtime.openMediaInput.mockResolvedValue(openedInput());
    runtime.CanvasSink.mockImplementationOnce(function () {
      return {
        canvasesAtTimestamps: () =>
          (async function* () {
            yield { canvas };
            yield { canvas };
          })(),
      };
    });
    send({ ...request(1, 'stale-blob'), visibleTimes: [0, 1] });
    await flush();
    send({ type: 'clear', generation: 2 });
    gate.resolve(new Blob(['late']));
    await flush();
    expect(messages()).toEqual([{ type: 'batch-started', generation: 1 }]);
    expect(canvas.convertToBlob).toHaveBeenCalledOnce();
  });

  it.each(['av01.0.08M.08', 'vp09.00.40.08'])(
    'uses the same buffered software decoder as playback on Linux: %s',
    async (parameter) => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Linux');
      const opened = openedInput(parameter);
      runtime.openMediaInput.mockResolvedValueOnce(opened);
      send(request(1, 'av1'));
      await flush();
      expect(VideoDecoder.isConfigSupported).toHaveBeenCalledWith({
        codec: parameter,
        hardwareAcceleration: 'prefer-software',
        optimizeForLatency: false,
      });
      expect(runtime.CanvasSink).toHaveBeenCalledWith(expect.anything(), {
        width: 240,
        poolSize: 2,
        decoderOptions: { hardwareAcceleration: 'prefer-software', optimizeForLatency: false },
      });
      expect(messages()).toContainEqual({ type: 'batch-finished', generation: 1 });
    },
  );
  it('keeps normal AV1 thumbnail decoding on Windows and macOS', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Macintosh');
    runtime.openMediaInput.mockResolvedValueOnce(openedInput('av01.0.08M.08'));
    send(request(1, 'mac-av1'));
    await flush();
    expect(runtime.CanvasSink).toHaveBeenCalledWith(expect.anything(), { width: 240, poolSize: 2 });
  });
  it('reports unavailable software AV1 support and releases the input', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Linux');
    vi.mocked(VideoDecoder.isConfigSupported).mockResolvedValue({ supported: false });
    const opened = openedInput('av01.0.08M.08');
    runtime.openMediaInput.mockResolvedValueOnce(opened);
    send(request(1, 'unsupported-av1'));
    await flush();
    expect(opened.dispose).toHaveBeenCalledOnce();
    expect(runtime.CanvasSink).not.toHaveBeenCalled();
    expect(messages()).toContainEqual({
      type: 'error',
      generation: 1,
      message: 'This video codec is not supported by WebCodecs.',
    });
  });
  it.each([240, 480, 960])('uses the requested %s canvas width and returns it with each frame', async (width) => {
    const canvas = { convertToBlob: vi.fn().mockResolvedValue(new Blob(['frame'])) };
    runtime.CanvasSink.mockImplementationOnce(function CanvasSinkMock() {
      const sink = {
        canvasesAtTimestamps: vi.fn().mockReturnValue(
          (async function* () {
            yield { canvas };
          })(),
        ),
      };
      runtime.sinks.push(sink);
      return sink;
    });
    runtime.openMediaInput.mockResolvedValueOnce(openedInput());

    send(request(1, 'sized', width));
    await flush();

    expect(runtime.CanvasSink).toHaveBeenCalledWith(expect.anything(), { width, poolSize: 2 });
    expect(messages()).toContainEqual(expect.objectContaining({ type: 'frame-ready', generation: 1, time: 1, width }));
  });

  it('disposes a candidate input resolved after clear without creating a sink', async () => {
    const opened = openedInput();
    const pendingOpen = deferred<typeof opened>();
    runtime.openMediaInput.mockReturnValueOnce(pendingOpen.promise);

    send(request(1, 'stale'));
    await flush();
    send({ type: 'clear', generation: 2 });
    pendingOpen.resolve(opened);
    await flush();

    expect(opened.dispose).toHaveBeenCalledOnce();
    expect(runtime.CanvasSink).not.toHaveBeenCalled();
    expect(messages()).toEqual([{ type: 'batch-started', generation: 1 }]);
  });

  it('disposes a stale source before committing only the replacement sink', async () => {
    const firstOpened = openedInput();
    const secondOpened = openedInput();
    const firstOpen = deferred<typeof firstOpened>();
    runtime.openMediaInput.mockImplementation((value: { assetId: string }) =>
      value.assetId === 'first' ? firstOpen.promise : Promise.resolve(secondOpened),
    );

    send(request(1, 'first'));
    await flush();
    send(request(2, 'second'));
    firstOpen.resolve(firstOpened);
    await flush();

    expect(firstOpened.dispose).toHaveBeenCalledOnce();
    expect(secondOpened.dispose).not.toHaveBeenCalled();
    expect(runtime.CanvasSink).toHaveBeenCalledOnce();
    expect(messages()).toContainEqual({ type: 'batch-finished', generation: 2 });
  });
});
