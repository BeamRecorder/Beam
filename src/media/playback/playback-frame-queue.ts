import type { WrappedCanvas } from 'mediabunny';
import type { PlaybackMetrics } from './playback-types';
import type { ClipConsumer, QueuedFrame } from './playback-worker-consumers';

export function createPlaybackFrameQueue(
  metrics: PlaybackMetrics,
  isDisposed: () => boolean,
  updateQueueMetric: () => void,
  reportError: (message: string, error: unknown) => void,
) {
  async function bitmapFor(wrapped: WrappedCanvas): Promise<QueuedFrame> {
    const bitmap =
      'transferToImageBitmap' in wrapped.canvas
        ? wrapped.canvas.transferToImageBitmap()
        : await createImageBitmap(wrapped.canvas);
    metrics.decodedFrames += 1;
    return { bitmap, timestampSeconds: wrapped.timestamp, durationSeconds: wrapped.duration };
  }

  function closeFrame(frame: QueuedFrame, dropped = false) {
    frame.bitmap.close();
    metrics.disposedBitmaps += 1;
    if (dropped) metrics.droppedFrames += 1;
  }

  async function closeIterator(iterator: AsyncIterator<WrappedCanvas> | null) {
    if (!iterator) return;
    try {
      await iterator.return?.();
    } catch (error) {
      reportError('Canvas iterator cleanup failed.', error);
    }
  }

  async function resetConsumer(consumer: ClipConsumer) {
    const iterator = consumer.iterator;
    // Detach owned state before yielding: a newer reset must not inherit the
    // old iterator, and its replacement queue must survive this cleanup.
    consumer.iteratorGeneration += 1;
    consumer.iterator = null;
    consumer.lastTargetSeconds = null;
    for (const frame of consumer.queue) closeFrame(frame);
    consumer.queue.length = 0;
    await closeIterator(iterator);
  }

  async function resetSequential(consumer: ClipConsumer, startSeconds: number) {
    await closeIterator(consumer.iterator);
    consumer.iteratorGeneration += 1;
    consumer.iterator = consumer.sink.canvases(startSeconds)[Symbol.asyncIterator]();
    consumer.lastTargetSeconds = startSeconds;
    for (const frame of consumer.queue) closeFrame(frame, true);
    consumer.queue.length = 0;
  }

  async function fillQueue(consumer: ClipConsumer) {
    const iteratorGeneration = consumer.iteratorGeneration;
    while (consumer.iterator && consumer.queue.length < 2) {
      const result = await consumer.iterator.next();
      if (iteratorGeneration !== consumer.iteratorGeneration || isDisposed()) return;
      if (result.done) {
        consumer.iterator = null;
        break;
      }
      consumer.queue.push(await bitmapFor(result.value));
    }
    updateQueueMetric();
  }

  async function sequentialFrame(consumer: ClipConsumer, targetSeconds: number): Promise<QueuedFrame | null> {
    const jumped =
      consumer.lastTargetSeconds === null ||
      targetSeconds < consumer.lastTargetSeconds ||
      targetSeconds - consumer.lastTargetSeconds > 0.5;
    if (!consumer.iterator || jumped) await resetSequential(consumer, targetSeconds);
    consumer.lastTargetSeconds = targetSeconds;
    await fillQueue(consumer);
    while (consumer.queue.length > 1 && consumer.queue[1]!.timestampSeconds <= targetSeconds) {
      closeFrame(consumer.queue.shift()!, true);
    }
    const frame = consumer.queue[0];
    if (!frame || frame.timestampSeconds > targetSeconds + frame.durationSeconds) return null;
    consumer.queue.shift();
    await fillQueue(consumer);
    return frame;
  }
  return { bitmapFor, closeFrame, closeIterator, resetConsumer, sequentialFrame };
}
