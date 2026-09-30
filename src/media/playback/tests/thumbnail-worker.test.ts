import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    input: { getPrimaryVideoTrack: vi.fn().mockResolvedValue(track) },
    dispose: vi.fn(),
  };
};

const flush = async () => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
};

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
  it('uses the same buffered software AV1 decoder as playback on Linux', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Linux');
    const opened = openedInput('av01.0.08M.08');
    runtime.openMediaInput.mockResolvedValueOnce(opened);
    send(request(1, 'av1'));
    await flush();
    expect(VideoDecoder.isConfigSupported).toHaveBeenCalledWith({
      codec: 'av01.0.08M.08',
      hardwareAcceleration: 'prefer-software',
      optimizeForLatency: false,
    });
    expect(runtime.CanvasSink).toHaveBeenCalledWith(expect.anything(), {
      width: 240,
      poolSize: 2,
      decoderOptions: { hardwareAcceleration: 'prefer-software', optimizeForLatency: false },
    });
    expect(messages()).toContainEqual({ type: 'batch-finished', generation: 1 });
  });
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
