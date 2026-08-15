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

const videoTrack = (displayWidth = 3_840, displayHeight = 1_920) => ({
  canDecode: vi.fn().mockResolvedValue(true),
  getCodec: vi.fn().mockResolvedValue('avc1.640028'),
  getDisplayWidth: vi.fn().mockResolvedValue(displayWidth),
  getDisplayHeight: vi.fn().mockResolvedValue(displayHeight),
  displayWidth,
  displayHeight,
});

const openedVideo = (track = videoTrack()) => ({
  input: { getPrimaryVideoTrack: vi.fn().mockResolvedValue(track) },
  dispose: vi.fn(),
});

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

  runtime.openMediaInput.mockResolvedValue(openedVideo());

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
    expect(runtime.CanvasSink).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({ poolSize: 3 }));
    expect(runtime.CanvasSink).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({ poolSize: 3 }));
    expect(messages()).toContainEqual({ type: 'ready', generation: 3 });

    send({ type: 'dispose' });
    const opened = await runtime.openMediaInput.mock.results[0]!.value;
    expect(opened.dispose).toHaveBeenCalledOnce();
    expect(workerSelf.postMessage).toHaveBeenCalledTimes(1);
  });

  it('bounds preview sink output for a 4K source and requests low-latency hardware decoding', async () => {
    send({ type: 'load', generation: 4, assets: [source('asset-1')], clips: [clip('clip-a')] });
    await flush();

    const options = runtime.CanvasSink.mock.calls[0]?.[1] as {
      width?: number;
      height?: number;
      fit?: string;
      decoderOptions?: Record<string, unknown>;
    };
    expect(options.width).toBeGreaterThan(0);
    expect(options.height).toBeGreaterThan(0);
    expect(options.width).toBeLessThanOrEqual(1_920);
    expect(options.height).toBeLessThanOrEqual(1_080);
    expect(options.fit).toBe('contain');
    expect(options.decoderOptions).toMatchObject({
      hardwareAcceleration: 'prefer-hardware',
      optimizeForLatency: true,
    });
  });

  it('never upscales a low-resolution preview sink', async () => {
    runtime.openMediaInput.mockReset().mockResolvedValue(openedVideo(videoTrack(640, 480)));
    send({ type: 'load', generation: 5, assets: [source('asset-1')], clips: [clip('clip-a')] });
    await flush();

    const options = runtime.CanvasSink.mock.calls[0]?.[1] as { width?: number; height?: number };
    expect(options.width).toBeGreaterThan(0);
    expect(options.height).toBeGreaterThan(0);
    expect(options.width).toBeLessThanOrEqual(640);
    expect(options.height).toBeLessThanOrEqual(480);
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

  it('starts active consumer iterators in parallel instead of waiting for the first decode', async () => {
    const firstNext = deferred<IteratorResult<Wrapped>>();
    const secondNext = deferred<IteratorResult<Wrapped>>();
    const firstFrame = bitmap();
    const secondFrame = bitmap();
    const firstIterator = {
      next: vi
        .fn()
        .mockImplementationOnce(() => firstNext.promise)
        .mockResolvedValue({ done: true, value: undefined }),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    const secondIterator = {
      next: vi
        .fn()
        .mockImplementationOnce(() => secondNext.promise)
        .mockResolvedValue({ done: true, value: undefined }),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    send({
      type: 'load',
      generation: 6,
      assets: [source('asset-1'), source('asset-2')],
      clips: [clip('clip-a', 'asset-1'), clip('clip-b', 'asset-2')],
    });
    await flush();
    const firstSink = runtime.sinkInstances[0]!;
    const secondSink = runtime.sinkInstances[1]!;
    firstSink.canvases.mockReturnValueOnce(firstIterator);
    secondSink.canvases.mockReturnValueOnce(secondIterator);

    send({ type: 'tick', generation: 6, timelineSeconds: 0 });
    await flush();

    expect(firstIterator.next).toHaveBeenCalledOnce();
    expect(secondIterator.next).toHaveBeenCalledOnce();

    firstNext.resolve({ value: wrapped(0, firstFrame), done: false });
    secondNext.resolve({ value: wrapped(0, secondFrame), done: false });
    await flush();
    expect(messages()).toContainEqual(expect.objectContaining({ type: 'frame', clipId: 'clip-a' }));
    expect(messages()).toContainEqual(expect.objectContaining({ type: 'frame', clipId: 'clip-b' }));
  });

  it('starts active seek decodes in parallel for independent consumers', async () => {
    const firstCanvas = deferred<Wrapped | null>();
    const secondCanvas = deferred<Wrapped | null>();
    const firstFrame = bitmap();
    const secondFrame = bitmap();
    send({
      type: 'load',
      generation: 7,
      assets: [source('asset-1'), source('asset-2')],
      clips: [clip('clip-a', 'asset-1'), clip('clip-b', 'asset-2')],
    });
    await flush();
    const firstSink = runtime.sinkInstances[0]!;
    const secondSink = runtime.sinkInstances[1]!;
    firstSink.getCanvas.mockImplementationOnce(() => firstCanvas.promise);
    secondSink.getCanvas.mockImplementationOnce(() => secondCanvas.promise);

    send({ type: 'seek', generation: 7, requestId: 77, timelineSeconds: 0, mode: 'seek' });
    await flush();

    expect(firstSink.getCanvas).toHaveBeenCalledOnce();
    expect(secondSink.getCanvas).toHaveBeenCalledOnce();

    firstCanvas.resolve(wrapped(0, firstFrame));
    secondCanvas.resolve(wrapped(0, secondFrame));
    await flush();
    expect(messages().filter((message) => message.type === 'frame' && message.requestId === 77)).toHaveLength(2);
    expect(messages()).toContainEqual({
      type: 'seek-result',
      generation: 7,
      requestId: 77,
      result: 'presented',
      latencyMs: expect.any(Number),
    });
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

  it('presents a frame decoded by a slow tick instead of starving while a newer tick is pending', async () => {
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

    expect(stale.close).not.toHaveBeenCalled();
    expect(messages().filter((message) => message.type === 'frame')).toHaveLength(2);
    expect(messages()).toContainEqual(expect.objectContaining({ type: 'frame', timestampSeconds: 1 }));
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

  it('does not let an obsolete load reinsert an asset after asynchronous track validation', async () => {
    const firstOpen = deferred<ReturnType<typeof openedVideo>>();
    const firstTrack = deferred<ReturnType<typeof videoTrack>>();
    const firstOpened = {
      input: { getPrimaryVideoTrack: vi.fn(() => firstTrack.promise) },
      dispose: vi.fn(),
    };
    const secondOpened = openedVideo();
    runtime.openMediaInput
      .mockReset()
      .mockImplementationOnce(() => firstOpen.promise)
      .mockResolvedValueOnce(secondOpened);

    send({ type: 'load', generation: 10, assets: [source('asset-1')], clips: [clip('old-clip')] });
    firstOpen.resolve(firstOpened);
    await flush();

    send({ type: 'load', generation: 11, assets: [source('asset-1')], clips: [clip('current-clip')] });
    await flush();
    firstTrack.resolve(videoTrack());
    await flush();

    expect(messages().filter((message) => message.type === 'ready')).toEqual([{ type: 'ready', generation: 11 }]);
    expect(runtime.CanvasSink).toHaveBeenCalledTimes(1);
    expect(firstOpened.dispose).toHaveBeenCalledOnce();
  });
});
