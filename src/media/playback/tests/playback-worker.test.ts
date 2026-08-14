import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaSourceDescriptor } from '../../shared';
import type { PlaybackWorkerResponse } from '../playback-types';

type TestBitmap = {
  width: number;
  height: number;
  close: ReturnType<typeof vi.fn>;
};

type Wrapped = {
  timestamp: number;
  duration: number;
  canvas: { transferToImageBitmap: () => TestBitmap };
};

const runtime = vi.hoisted(() => {
  class TestMediaInputError extends Error {
    detail: unknown;

    constructor(detail: { message: string; [key: string]: unknown }) {
      super(detail.message);
      this.name = 'MediaInputError';
      this.detail = detail;
    }
  }

  return {
    openMediaInput: vi.fn(),
    MediaInputError: TestMediaInputError,
    CanvasSink: vi.fn(),
    sinkInstances: [] as Array<{
      canvases: ReturnType<typeof vi.fn>;
      getCanvas: ReturnType<typeof vi.fn>;
    }>,
  };
});

vi.mock('../../shared', () => ({
  MediaInputError: runtime.MediaInputError,
  openMediaInput: runtime.openMediaInput,
}));

vi.mock('mediabunny', () => ({ CanvasSink: runtime.CanvasSink }));

const source = (assetId: string): MediaSourceDescriptor => ({
  assetId,
  kind: 'video',
  label: assetId,
  url: `project-media://asset/${assetId}`,
});

const clip = (clipId: string, assetId = 'asset-1') => ({
  clipId,
  assetId,
  timelineStartSeconds: 0,
  timelineDurationSeconds: 10,
  sourceInSeconds: 0,
  playbackRate: 1,
});

const bitmap = (width = 320, height = 180): TestBitmap => {
  const value = new (globalThis.ImageBitmap as unknown as new () => TestBitmap)();
  value.width = width;
  value.height = height;
  value.close = vi.fn();
  return value;
};

const wrapped = (timestamp: number, output = bitmap()): Wrapped => ({
  timestamp,
  duration: 0.04,
  canvas: { transferToImageBitmap: () => output },
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const flush = async () => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 20));
};

let workerSelf: { onmessage?: (event: MessageEvent<unknown>) => void; postMessage: ReturnType<typeof vi.fn> };

beforeEach(async () => {
  vi.resetModules();
  runtime.openMediaInput.mockReset();
  runtime.CanvasSink.mockReset();
  runtime.sinkInstances.length = 0;

  class TestImageBitmap {
    width = 320;
    height = 180;
    close = vi.fn();
  }
  vi.stubGlobal('ImageBitmap', TestImageBitmap);
  workerSelf = { onmessage: undefined, postMessage: vi.fn() };
  vi.stubGlobal('self', workerSelf);

  runtime.CanvasSink.mockImplementation(function CanvasSinkMock() {
    const instance = {
      canvases: vi.fn().mockReturnValue((async function* () {})()),
      getCanvas: vi.fn().mockResolvedValue(null),
    };
    runtime.sinkInstances.push(instance);
    return instance;
  });

  const track = {
    canDecode: vi.fn().mockResolvedValue(true),
    getCodec: vi.fn().mockResolvedValue('avc1.640028'),
  };
  runtime.openMediaInput.mockResolvedValue({
    input: { getPrimaryVideoTrack: vi.fn().mockResolvedValue(track) },
    dispose: vi.fn(),
  });

  await import('../playback.worker');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const send = (message: unknown) => workerSelf.onmessage!({ data: message } as MessageEvent<unknown>);
const messages = () => workerSelf.postMessage.mock.calls.map(([message]) => message as PlaybackWorkerResponse);

describe('playback worker', () => {
  it('loads one decoder per asset, creates consumers per clip, and disposes everything', async () => {
    send({ type: 'load', generation: 3, assets: [source('asset-1')], clips: [clip('clip-a'), clip('clip-b')] });
    await flush();

    expect(runtime.openMediaInput).toHaveBeenCalledOnce();
    expect(runtime.CanvasSink).toHaveBeenCalledTimes(2);
    expect(runtime.CanvasSink).toHaveBeenNthCalledWith(1, expect.anything(), { poolSize: 3 });
    expect(runtime.CanvasSink).toHaveBeenNthCalledWith(2, expect.anything(), { poolSize: 3 });
    expect(messages()).toContainEqual({ type: 'ready', generation: 3 });

    send({ type: 'dispose' });
    const opened = await runtime.openMediaInput.mock.results[0]!.value;
    expect(opened.dispose).toHaveBeenCalledOnce();
    expect(workerSelf.postMessage).toHaveBeenCalledTimes(1);
  });

  it('shares the asset decoder when two clips reference the same asset', async () => {
    send({
      type: 'load',
      generation: 1,
      assets: [source('asset-1'), source('asset-2')],
      clips: [clip('clip-a', 'asset-1'), clip('clip-b', 'asset-1'), clip('clip-c', 'asset-2')],
    });
    await flush();

    expect(runtime.openMediaInput).toHaveBeenCalledTimes(2);
    expect(runtime.CanvasSink).toHaveBeenCalledTimes(3);
  });

  it('resolves project-media assets by id at the initial seek and reports unavailable assets explicitly', async () => {
    send({ type: 'load', generation: 7, assets: [source('asset-1')], clips: [clip('clip-a', 'asset-1')] });
    await flush();

    expect(runtime.openMediaInput).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'asset-1',
        url: 'project-media://asset/asset-1',
        kind: 'video',
      }),
    );
    const sink = runtime.sinkInstances[0]!;
    sink.getCanvas.mockResolvedValueOnce(null);
    const firstFrame = bitmap();
    const firstSequential = {
      next: vi.fn().mockResolvedValueOnce({ value: wrapped(0.04, firstFrame), done: false }),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    sink.canvases.mockReturnValueOnce(firstSequential);
    send({ type: 'seek', generation: 7, requestId: 70, timelineSeconds: 0, mode: 'seek' });
    await flush();
    expect(sink.getCanvas).toHaveBeenCalledWith(0);
    expect(sink.canvases).toHaveBeenCalledWith(0);
    expect(messages()).toContainEqual(
      expect.objectContaining({ type: 'frame', requestId: 70, timestampSeconds: 0.04 }),
    );
    expect(messages()).toContainEqual({
      type: 'seek-result',
      generation: 7,
      requestId: 70,
      result: 'presented',
      latencyMs: expect.any(Number),
    });
    expect(firstFrame.close).not.toHaveBeenCalled();

    sink.getCanvas.mockResolvedValueOnce(null);
    sink.canvases.mockReturnValueOnce({
      next: vi.fn().mockResolvedValue({ value: undefined, done: true }),
      [Symbol.asyncIterator]() {
        return this;
      },
    });
    send({ type: 'seek', generation: 7, requestId: 71, timelineSeconds: 1, mode: 'seek' });
    await flush();
    expect(sink.getCanvas).toHaveBeenCalledWith(1);
    expect(sink.canvases).toHaveBeenCalledWith(1);
    expect(messages()).toContainEqual({
      type: 'error',
      generation: 7,
      requestId: 71,
      error: {
        kind: 'decode-failure',
        sourceId: 'playback',
        message: 'No video frame is available at the requested time.',
      },
    });

    runtime.openMediaInput.mockReset().mockRejectedValueOnce(
      new runtime.MediaInputError({
        kind: 'missing',
        sourceId: 'asset-1',
        message: 'The media asset is unavailable.',
      }),
    );
    send({ type: 'load', generation: 8, assets: [source('asset-1')], clips: [clip('clip-a', 'asset-1')] });
    await flush();
    expect(messages()).toContainEqual({
      type: 'error',
      generation: 8,
      error: { kind: 'missing', sourceId: 'asset-1', message: 'The media asset is unavailable.' },
    });
  });

  it('supersedes a seek that is still decoding and presents only the latest request', async () => {
    const first = deferred<Wrapped | null>();
    const second = deferred<Wrapped | null>();
    send({ type: 'load', generation: 1, assets: [source('asset-1')], clips: [clip('clip-a')] });
    await flush();
    const sink = runtime.sinkInstances[0]!;
    sink.getCanvas.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

    send({ type: 'seek', generation: 1, requestId: 10, timelineSeconds: 1, mode: 'seek' });
    await flush();
    send({ type: 'seek', generation: 1, requestId: 11, timelineSeconds: 2, mode: 'scrub' });
    const stale = bitmap();
    first.resolve(wrapped(1, stale));
    await flush();
    expect(messages()).toContainEqual({
      type: 'seek-result',
      generation: 1,
      requestId: 10,
      result: 'superseded',
      latencyMs: expect.any(Number),
    });
    expect(stale.close).toHaveBeenCalledOnce();

    const current = bitmap();
    second.resolve(wrapped(2, current));
    await flush();
    expect(messages()).toContainEqual(expect.objectContaining({ type: 'frame', requestId: 11, clipId: 'clip-a' }));
    expect(messages()).toContainEqual({
      type: 'seek-result',
      generation: 1,
      requestId: 11,
      result: 'presented',
      latencyMs: expect.any(Number),
    });
    expect(stale.close).toHaveBeenCalledOnce();
    expect(current.close).not.toHaveBeenCalled();
  });

  it('transfers a decoded scrub frame before superseding it and continues with the newest scrub', async () => {
    const first = deferred<Wrapped | null>();
    const second = deferred<Wrapped | null>();
    send({ type: 'load', generation: 1, assets: [source('asset-1')], clips: [clip('clip-a')] });
    await flush();
    const sink = runtime.sinkInstances[0]!;
    sink.getCanvas.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

    send({ type: 'seek', generation: 1, requestId: 20, timelineSeconds: 1, mode: 'scrub' });
    await flush();
    send({ type: 'seek', generation: 1, requestId: 21, timelineSeconds: 1.5, mode: 'scrub' });

    const scrubFrame = bitmap();
    first.resolve(wrapped(1, scrubFrame));
    await flush();

    const afterFirst = messages();
    const firstFrameIndex = afterFirst.findIndex((message) => message.type === 'frame' && message.requestId === 20);
    const firstResultIndex = afterFirst.findIndex(
      (message) => message.type === 'seek-result' && message.requestId === 20,
    );
    expect(firstFrameIndex).toBeGreaterThanOrEqual(0);
    expect(firstResultIndex).toBeGreaterThan(firstFrameIndex);
    expect(afterFirst[firstResultIndex]).toMatchObject({
      type: 'seek-result',
      generation: 1,
      requestId: 20,
      result: 'superseded',
    });
    expect(scrubFrame.close).not.toHaveBeenCalled();

    const newestFrame = bitmap();
    second.resolve(wrapped(1.5, newestFrame));
    await flush();

    expect(messages()).toContainEqual(expect.objectContaining({ type: 'frame', requestId: 21, clipId: 'clip-a' }));
    expect(messages()).toContainEqual({
      type: 'seek-result',
      generation: 1,
      requestId: 21,
      result: 'presented',
      latencyMs: expect.any(Number),
    });
    expect(newestFrame.close).not.toHaveBeenCalled();
  });

  it('associates decode failures with the active seek request id', async () => {
    send({ type: 'load', generation: 4, assets: [source('asset-1')], clips: [clip('clip-a')] });
    await flush();
    runtime.sinkInstances[0]!.getCanvas.mockRejectedValue(new Error('decoder exploded'));

    send({ type: 'seek', generation: 4, requestId: 42, timelineSeconds: 1, mode: 'seek' });
    await flush();

    expect(messages()).toContainEqual({
      type: 'error',
      generation: 4,
      requestId: 42,
      error: { kind: 'decode-failure', sourceId: 'playback', message: 'decoder exploded' },
    });
  });

  it('coalesces ticks and closes a frame decoded for a stale tick', async () => {
    const next = deferred<IteratorResult<Wrapped>>();
    const stale = bitmap();
    const current = bitmap();
    send({ type: 'load', generation: 1, assets: [source('asset-1')], clips: [clip('clip-a')] });
    await flush();
    const sink = runtime.sinkInstances[0]!;
    sink.canvases.mockReturnValue({
      next: vi
        .fn()
        .mockImplementationOnce(() => next.promise)
        .mockResolvedValueOnce({ value: wrapped(1.2, current), done: false })
        .mockResolvedValueOnce({ value: wrapped(1.24), done: false })
        .mockResolvedValueOnce({ value: undefined, done: true }),
      [Symbol.asyncIterator]() {
        return this;
      },
    });

    send({ type: 'tick', generation: 1, timelineSeconds: 1 });
    await flush();
    send({ type: 'tick', generation: 1, timelineSeconds: 1.2 });
    next.resolve({ value: wrapped(1, stale), done: false });
    await flush();

    expect(stale.close).toHaveBeenCalledOnce();
    expect(messages().filter((message) => message.type === 'frame')).toHaveLength(1);
    expect(messages()).toContainEqual(expect.objectContaining({ type: 'frame', timestampSeconds: 1.2 }));
  });

  it('keeps sequential decode queues at two frames and drops stale queued frames', async () => {
    const frames = [bitmap(), bitmap(), bitmap(), bitmap()];
    const iterator = {
      next: vi
        .fn()
        .mockResolvedValueOnce({ value: wrapped(0, frames[0]), done: false })
        .mockResolvedValueOnce({ value: wrapped(0.04, frames[1]), done: false })
        .mockResolvedValueOnce({ value: wrapped(0.08, frames[2]), done: false })
        .mockResolvedValueOnce({ value: wrapped(1, frames[3]), done: false })
        .mockResolvedValue({ value: undefined, done: true }),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    send({ type: 'load', generation: 2, assets: [source('asset-1')], clips: [clip('clip-a')] });
    await flush();
    runtime.sinkInstances[0]!.canvases.mockReturnValue(iterator);

    send({ type: 'tick', generation: 2, timelineSeconds: 0 });
    await flush();
    const firstMetrics = messages().find((message) => message.type === 'metrics');
    expect(firstMetrics?.metrics.queueSize).toBeLessThanOrEqual(2);
    expect(iterator.next).toHaveBeenCalledTimes(3);

    send({ type: 'tick', generation: 2, timelineSeconds: 1 });
    await flush();
    expect(frames[1]!.close).toHaveBeenCalledOnce();
    expect(messages().filter((message) => message.type === 'frame')).toHaveLength(2);
  });

  it('reports invalid inbound messages as decode failures', async () => {
    send({ type: 'seek', generation: -1, requestId: 1, timelineSeconds: 0, mode: 'seek' });
    expect(messages()).toContainEqual({
      type: 'error',
      generation: 0,
      error: { kind: 'decode-failure', sourceId: 'worker', message: 'Invalid playback worker message.' },
    });
  });
});
