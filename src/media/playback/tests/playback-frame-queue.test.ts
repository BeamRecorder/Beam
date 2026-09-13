import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WrappedCanvas } from 'mediabunny';
import { createPlaybackFrameQueue } from '../playback-frame-queue';
import type { PlaybackMetrics } from '../playback-types';
import type { ClipConsumer, QueuedFrame } from '../playback-worker-consumers';

const metrics = (): PlaybackMetrics => ({
  decodedFrames: 0,
  presentedFrames: 0,
  droppedFrames: 0,
  supersededRequests: 0,
  queueSize: 0,
  cacheBytes: 0,
  disposedBitmaps: 0,
  seekLatencyMs: [],
});

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

afterEach(() => vi.unstubAllGlobals());

describe('playback frame queue ownership', () => {
  it('owns a bitmap created from a canvas without transferToImageBitmap', async () => {
    const image = { width: 1920, height: 1080, close: vi.fn() } as unknown as ImageBitmap;
    const create = vi.fn().mockResolvedValue(image);
    vi.stubGlobal('createImageBitmap', create);
    const counts = metrics();
    const queue = createPlaybackFrameQueue(counts, () => false, vi.fn(), vi.fn());
    const canvas = document.createElement('canvas');
    const frame = await queue.bitmapFor({ canvas, timestamp: 1.2, duration: 0.04 });
    expect(create).toHaveBeenCalledExactlyOnceWith(canvas);
    expect(frame).toEqual({ bitmap: image, timestampSeconds: 1.2, durationSeconds: 0.04 });
    expect(counts.decodedFrames).toBe(1);
    queue.closeFrame(frame, true);
    expect(image.close).toHaveBeenCalledOnce();
    expect(counts.disposedBitmaps).toBe(1);
    expect(counts.droppedFrames).toBe(1);
  });

  it('reports iterator cleanup errors and still releases all owned queue frames', async () => {
    const failure = new Error('Decoder cleanup rejected');
    const report = vi.fn();
    const first = { bitmap: { close: vi.fn() }, timestampSeconds: 0, durationSeconds: 0.04 };
    const second = { bitmap: { close: vi.fn() }, timestampSeconds: 0.04, durationSeconds: 0.04 };
    const consumer = {
      iterator: { return: vi.fn().mockRejectedValue(failure) },
      iteratorGeneration: 3,
      lastTargetSeconds: 0,
      queue: [first, second],
    } as unknown as ClipConsumer;
    const counts = metrics();
    const queue = createPlaybackFrameQueue(counts, () => false, vi.fn(), report);
    await queue.resetConsumer(consumer);
    expect(report).toHaveBeenCalledExactlyOnceWith('Canvas iterator cleanup failed.', failure);
    expect(first.bitmap.close).toHaveBeenCalledOnce();
    expect(second.bitmap.close).toHaveBeenCalledOnce();
    expect(consumer.iterator).toBeNull();
    expect(consumer.iteratorGeneration).toBe(4);
    expect(consumer.lastTargetSeconds).toBeNull();
    expect(consumer.queue).toEqual([]);
    expect(counts.disposedBitmaps).toBe(2);
  });

  it('does not let a pending old iterator cleanup clear replacement consumer state', async () => {
    const cleanup = deferred();
    const oldFrame = {
      bitmap: { close: vi.fn() },
      timestampSeconds: 0,
      durationSeconds: 0.04,
    } as unknown as QueuedFrame;
    const nextFrame = {
      bitmap: { close: vi.fn() },
      timestampSeconds: 1,
      durationSeconds: 0.04,
    } as unknown as QueuedFrame;
    const oldIterator = {
      return: vi.fn(() => cleanup.promise.then(() => ({ value: undefined, done: true as const }))),
    };
    const replacementIterator = { return: vi.fn().mockResolvedValue({ value: undefined, done: true as const }) };
    const consumer = {
      iterator: oldIterator,
      iteratorGeneration: 4,
      lastTargetSeconds: 0,
      queue: [oldFrame],
    } as unknown as ClipConsumer;
    const queue = createPlaybackFrameQueue(metrics(), () => false, vi.fn(), vi.fn());

    const resetting = queue.resetConsumer(consumer);
    expect(oldIterator.return).toHaveBeenCalledOnce();
    expect(oldFrame.bitmap.close).toHaveBeenCalledOnce();
    expect(consumer.iterator).toBeNull();
    expect(consumer.queue).toEqual([]);

    consumer.iterator = replacementIterator as unknown as ClipConsumer['iterator'];
    consumer.queue.push(nextFrame);
    consumer.lastTargetSeconds = 1;
    cleanup.resolve();
    await resetting;

    expect(consumer.iterator).toBe(replacementIterator);
    expect(consumer.queue).toEqual([nextFrame]);
    expect(nextFrame.bitmap.close).not.toHaveBeenCalled();
    expect(consumer.lastTargetSeconds).toBe(1);
    expect(replacementIterator.return).not.toHaveBeenCalled();
  });

  it('detaches an iterator before awaiting cleanup so concurrent resets call return once', async () => {
    const cleanup = deferred();
    const iterator = {
      return: vi.fn(() => cleanup.promise.then(() => ({ value: undefined, done: true as const }))),
    };
    const consumer = {
      iterator,
      iteratorGeneration: 2,
      lastTargetSeconds: 0,
      queue: [],
    } as unknown as ClipConsumer;
    const queue = createPlaybackFrameQueue(metrics(), () => false, vi.fn(), vi.fn());

    const firstReset = queue.resetConsumer(consumer);
    const secondReset = queue.resetConsumer(consumer);
    await secondReset;
    expect(iterator.return).toHaveBeenCalledOnce();

    cleanup.resolve();
    await firstReset;
    expect(iterator.return).toHaveBeenCalledOnce();
    expect(consumer.iterator).toBeNull();
    expect(consumer.iteratorGeneration).toBe(4);
  });

  it('retains future frames without presenting them before their time', async () => {
    const images = [
      { width: 10, height: 10, close: vi.fn() },
      { width: 10, height: 10, close: vi.fn() },
    ];
    const iterator = (async function* () {
      for (let index = 0; index < images.length; index += 1)
        yield {
          canvas: { transferToImageBitmap: () => images[index] },
          timestamp: 2 + index / 25,
          duration: 0.04,
        } as unknown as WrappedCanvas;
    })();
    const consumer = {
      sink: { canvases: vi.fn(() => iterator) },
      iterator: null,
      iteratorGeneration: 0,
      lastTargetSeconds: null,
      queue: [],
    } as unknown as ClipConsumer;
    const counts = metrics();
    const queue = createPlaybackFrameQueue(counts, () => false, vi.fn(), vi.fn());
    expect(await queue.sequentialFrame(consumer, 0)).toBeNull();
    expect(consumer.queue).toHaveLength(2);
    expect(images[0]!.close).not.toHaveBeenCalled();
    await queue.resetConsumer(consumer);
    for (const image of images) expect(image.close).toHaveBeenCalledOnce();
  });
});
