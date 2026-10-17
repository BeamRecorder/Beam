import { afterEach, expect, it, vi } from 'vitest';
import { createPlaybackFrameQueue } from '../playback-frame-queue';
import type { ClipConsumer } from '../playback-worker-consumers';
import type { WrappedCanvas } from 'mediabunny';
import { snapTimeToBoundary } from '@beam/engine/shared/time-boundary';

function source(samples: Array<{ timestamp: number; duration: number }>) {
  const images: Array<{ close: ReturnType<typeof vi.fn> }> = [];
  const counts = {
    decodedFrames: 0,
    presentedFrames: 0,
    droppedFrames: 0,
    supersededRequests: 0,
    queueSize: 0,
    cacheBytes: 0,
    disposedBitmaps: 0,
    seekLatencyMs: [],
  };
  const canvases = vi.fn((start: number) =>
    (async function* () {
      let first = 0;
      for (let i = 0; i < samples.length; i++) if (samples[i]!.timestamp <= start) first = i;
      for (const sample of samples.slice(first)) {
        const image = { width: 100, height: 50, close: vi.fn() };
        images.push(image);
        yield { ...sample, canvas: { transferToImageBitmap: () => image } } as unknown as WrappedCanvas;
      }
    })(),
  );
  const consumer = {
    sink: { canvases },
    iterator: null,
    iteratorGeneration: 0,
    lastTargetSeconds: null,
    ended: false,
    queue: [],
  } as unknown as ClipConsumer;
  const queue = createPlaybackFrameQueue(
    counts,
    () => false,
    vi.fn(),
    (message) => {
      throw new Error(message);
    },
  );
  return { queue, consumer, images, canvases, counts };
}

afterEach(() => vi.unstubAllGlobals());

it.each([24, 60, 120, 144, 240])('holds a long final image without reopening at %s Hz', async (hz) => {
  const { queue, consumer, canvases, counts, images } = source([{ timestamp: 0, duration: 60 }]);
  for (let i = 0; i < hz * 2; i++) {
    const frame = await queue.sequentialFrame(consumer, i / hz);
    if (i === 0) expect(frame?.timestampSeconds).toBe(0);
    else expect(frame).toBeNull();
    if (frame) queue.closeFrame(frame);
  }
  expect(canvases).toHaveBeenCalledOnce();
  expect(counts.decodedFrames).toBe(1);
  expect(consumer.ended).toBe(true);
  await queue.resetConsumer(consumer);
  expect(images[0]!.close).toHaveBeenCalledOnce();
});

it('keeps the final prefetched frame until its timestamp, even after EOF', async () => {
  const { queue, consumer, canvases } = source([
    { timestamp: 0, duration: 1 },
    { timestamp: 1, duration: 9 },
  ]);
  const first = await queue.sequentialFrame(consumer, 0);
  expect(first?.timestampSeconds).toBe(0);
  expect(consumer.ended).toBe(true);
  expect(consumer.queue).toHaveLength(1);
  for (const time of [0.01, 0.1, 0.49, 0.8, 0.99]) expect(await queue.sequentialFrame(consumer, time)).toBeNull();
  const last = await queue.sequentialFrame(consumer, 1 - Number.EPSILON);
  expect(last?.timestampSeconds).toBe(1);
  expect(canvases).toHaveBeenCalledOnce();
  if (first) queue.closeFrame(first);
  if (last) queue.closeFrame(last);
  await queue.resetConsumer(consumer);
});

it.each(
  [24, 30, 60, 120].flatMap((fps) =>
    [24, 60, 144, 240].flatMap((hz) => [0.5, 1, 4].map((rate) => ({ fps, hz, rate }))),
  ),
)('presents exact source frames at $fps fps, $hz Hz and $rate speed', async ({ fps, hz, rate }) => {
  const samples = Array.from({ length: fps * 5 }, (_, i) => ({ timestamp: i / fps, duration: 1 / fps }));
  const { queue, consumer, canvases, counts, images } = source(samples);
  let displayed: number | null = null;
  for (let i = 0; i < hz; i++) {
    const time = (i / hz) * rate;
    const expected = samples
      .filter((sample) => sample.timestamp <= snapTimeToBoundary(time, sample.timestamp))
      .at(-1)!.timestamp;
    const frame = await queue.sequentialFrame(consumer, time);
    if (frame) {
      expect(frame.timestampSeconds).toBeLessThanOrEqual(snapTimeToBoundary(time, frame.timestampSeconds));
      displayed = frame.timestampSeconds;
      queue.closeFrame(frame);
    }
    expect(displayed).toBeCloseTo(expected, 10);
    expect(consumer.queue.length).toBeLessThanOrEqual(2);
  }
  expect(canvases).toHaveBeenCalledOnce();
  await queue.resetConsumer(consumer);
  for (const image of images) expect(image.close).toHaveBeenCalledOnce();
  expect(counts.disposedBitmaps).toBe(counts.decodedFrames);
});

it('restarts exhausted sources after a backward seek, a large jump or an explicit reset', async () => {
  const { queue, consumer, canvases } = source([{ timestamp: 0, duration: 10 }]);
  for (const time of [0, 0.2, 0.1, 0.7]) {
    const frame = await queue.sequentialFrame(consumer, time);
    if (frame) queue.closeFrame(frame);
  }
  expect(canvases).toHaveBeenCalledTimes(3);
  await queue.resetConsumer(consumer);
  expect(consumer.ended).toBe(false);
  const frame = await queue.sequentialFrame(consumer, 0.7);
  expect(canvases).toHaveBeenCalledTimes(4);
  if (frame) queue.closeFrame(frame);
  await queue.resetConsumer(consumer);
});

it('keeps empty sources exhausted until reset', async () => {
  const { queue, consumer, canvases, counts } = source([]);
  for (let i = 0; i < 100; i++) expect(await queue.sequentialFrame(consumer, i / 120)).toBeNull();
  expect(canvases).toHaveBeenCalledOnce();
  expect(counts.decodedFrames).toBe(0);
  await queue.resetConsumer(consumer);
});

it('closes a bitmap that finishes copying after its consumer was reset', async () => {
  const { queue, consumer, counts } = source([]);
  let finish!: (image: ImageBitmap) => void;
  const copying = new Promise<ImageBitmap>((resolve) => {
    finish = resolve;
  });
  const started = vi.fn(() => copying);
  vi.stubGlobal('createImageBitmap', started);
  const image = { width: 100, height: 50, close: vi.fn() } as unknown as ImageBitmap;
  consumer.sink = {
    canvases: () =>
      (async function* () {
        yield { canvas: document.createElement('canvas'), timestamp: 0, duration: 1 };
      })(),
  } as unknown as ClipConsumer['sink'];
  const pending = queue.sequentialFrame(consumer, 0);
  await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
  await queue.resetConsumer(consumer);
  finish(image);
  expect(await pending).toBeNull();
  expect(consumer.queue).toEqual([]);
  expect(image.close).toHaveBeenCalledOnce();
  expect(counts.decodedFrames).toBe(counts.disposedBitmaps);
});
