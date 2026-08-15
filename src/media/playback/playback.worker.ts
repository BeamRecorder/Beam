import { CanvasSink, type WrappedCanvas } from 'mediabunny';
import { MediaInputError, openMediaInput, type MediaError, type OpenedMediaInput } from '../shared';
import { assertPlaybackWorkerRequest, assertPlaybackWorkerResponse } from './playback-protocol';
import { playbackPreviewDimensions } from './playback-preview';
import type {
  PlaybackClipDescriptor,
  PlaybackFrameMessage,
  PlaybackMetrics,
  PlaybackWorkerRequest,
  PlaybackWorkerResponse,
} from './playback-types';

const reportPlaybackWorkerError = (message: string, error?: unknown) =>
  console.error(`[Beam media:playback-worker] ${message}`, error ?? '');

const PLAYBACK_DECODER_OPTIONS = {
  hardwareAcceleration: 'prefer-hardware' as const,
  optimizeForLatency: true,
};

type QueuedFrame = {
  bitmap: ImageBitmap;
  timestampSeconds: number;
  durationSeconds: number;
};

type AssetDecoder = {
  assetId: string;
  opened: OpenedMediaInput;
  sinkTrack: Awaited<ReturnType<OpenedMediaInput['input']['getPrimaryVideoTrack']>>;
  previewWidth: number;
  previewHeight: number;
  decoderOptions?: typeof PLAYBACK_DECODER_OPTIONS;
};

type ClipConsumer = {
  clip: PlaybackClipDescriptor;
  asset: AssetDecoder;
  sink: CanvasSink;
  iterator: AsyncIterator<WrappedCanvas> | null;
  queue: QueuedFrame[];
  iteratorGeneration: number;
  lastTargetSeconds: number | null;
};

const assets = new Map<string, AssetDecoder>();
const consumers = new Map<string, ClipConsumer>();
let generation = 0;
let disposed = false;
let pendingSeek: Extract<PlaybackWorkerRequest, { type: 'seek' }> | null = null;
let processingSeek = false;
let pendingTick: Extract<PlaybackWorkerRequest, { type: 'tick' }> | null = null;
let processingTick = false;
let loadVersion = 0;
const loadTasks = new Set<Promise<void>>();
const processingIdleWaiters = new Set<() => void>();

const metrics: PlaybackMetrics = {
  decodedFrames: 0,
  presentedFrames: 0,
  droppedFrames: 0,
  supersededRequests: 0,
  queueSize: 0,
  cacheBytes: 0,
  disposedBitmaps: 0,
  seekLatencyMs: [],
};

self.onmessage = (event: MessageEvent<unknown>) => {
  try {
    assertPlaybackWorkerRequest(event.data);
    receive(event.data);
  } catch (error) {
    reportPlaybackWorkerError('Invalid request received.', error);
    postError({ kind: 'decode-failure', sourceId: 'worker', message: 'Invalid playback worker message.' });
  }
};

function receive(message: PlaybackWorkerRequest) {
  if (message.type === 'dispose') {
    disposed = true;
    void shutdown();
    return;
  }
  if (disposed) return;
  generation = Math.max(generation, message.generation);
  if (message.type === 'load') {
    const task = load(message);
    loadTasks.add(task);
    void task.finally(() => loadTasks.delete(task));
  } else if (message.type === 'seek') {
    if (pendingSeek) supersede(pendingSeek);
    pendingSeek = message;
    void processSeeks();
  } else if (message.type === 'tick') {
    pendingTick = message;
    void processTicks();
  } else if (message.type === 'play') {
    pendingTick = { type: 'tick', generation: message.generation, timelineSeconds: message.timelineSeconds };
    void processTicks();
  } else if (message.type === 'pause') {
    pendingTick = null;
  }
}

async function load(message: Extract<PlaybackWorkerRequest, { type: 'load' }>) {
  const version = ++loadVersion;
  await disposeAll(false);
  await waitForProcessingIdle();
  if (isStaleLoad(version)) return;
  const loadedAssets = new Map<string, AssetDecoder>();
  let committed = false;
  try {
    for (const descriptor of message.assets) {
      const opened = await openMediaInput(descriptor);
      if (isStaleLoad(version)) return disposeLoadedAssets(loadedAssets, opened);
      const track = await opened.input.getPrimaryVideoTrack();
      if (isStaleLoad(version)) return disposeLoadedAssets(loadedAssets, opened);
      if (!track) {
        opened.dispose();
        throw new MediaInputError({
          kind: 'missing-track',
          sourceId: descriptor.assetId,
          track: 'video',
          message: 'The playback asset has no video track.',
        });
      }
      const codec = await track.getCodec();
      if (isStaleLoad(version)) return disposeLoadedAssets(loadedAssets, opened);
      const canDecode = await track.canDecode();
      if (isStaleLoad(version)) return disposeLoadedAssets(loadedAssets, opened);
      if (!canDecode) {
        opened.dispose();
        throw new MediaInputError({
          kind: 'unsupported-codec',
          sourceId: descriptor.assetId,
          track: 'video',
          codec,
          message: 'The playback video codec is unsupported.',
        });
      }
      const decoderConfig = await track.getDecoderConfig();
      const baseConfigSupported =
        typeof VideoDecoder !== 'undefined' &&
        decoderConfig !== null &&
        (await VideoDecoder.isConfigSupported(decoderConfig)).supported;
      if (!baseConfigSupported) {
        opened.dispose();
        throw new MediaInputError({
          kind: 'unsupported-codec',
          sourceId: descriptor.assetId,
          track: 'video',
          codec,
          message: 'The playback video decoder configuration is unsupported.',
        });
      }
      const optimizedConfigSupported =
        typeof VideoDecoder !== 'undefined' &&
        decoderConfig !== null &&
        (await VideoDecoder.isConfigSupported({ ...decoderConfig, ...PLAYBACK_DECODER_OPTIONS })).supported;
      const displayWidth = await track.getDisplayWidth();
      if (isStaleLoad(version)) return disposeLoadedAssets(loadedAssets, opened);
      const displayHeight = await track.getDisplayHeight();
      if (isStaleLoad(version)) return disposeLoadedAssets(loadedAssets, opened);
      const preview = playbackPreviewDimensions(displayWidth, displayHeight);
      loadedAssets.set(descriptor.assetId, {
        assetId: descriptor.assetId,
        opened,
        sinkTrack: track,
        previewWidth: preview.width,
        previewHeight: preview.height,
        decoderOptions: optimizedConfigSupported ? PLAYBACK_DECODER_OPTIONS : undefined,
      });
    }
    if (isStaleLoad(version)) return disposeLoadedAssets(loadedAssets);
    for (const [assetId, asset] of loadedAssets) assets.set(assetId, asset);
    committed = true;
    for (const clip of message.clips) {
      const asset = assets.get(clip.assetId);
      if (!asset?.sinkTrack) {
        throw new MediaInputError({
          kind: 'missing',
          sourceId: clip.assetId,
          message: 'A playback clip references an unavailable asset.',
        });
      }
      consumers.set(clip.clipId, {
        clip,
        asset,
        sink: new CanvasSink(asset.sinkTrack, {
          width: asset.previewWidth,
          height: asset.previewHeight,
          fit: 'contain',
          poolSize: 3,
          ...(asset.decoderOptions ? { decoderOptions: asset.decoderOptions } : {}),
        }),
        iterator: null,
        queue: [],
        iteratorGeneration: 0,
        lastTargetSeconds: null,
      });
    }
    post({ type: 'ready', generation: message.generation });
  } catch (error) {
    if (!committed) disposeLoadedAssets(loadedAssets);
    if (isStaleLoad(version)) return;
    reportPlaybackWorkerError('Composition load failed.', mediaError(error, 'playback'));
    if (committed) await disposeAll(false);
    postError(mediaError(error, 'playback'), message.generation);
  }
}

function isStaleLoad(version: number) {
  return version !== loadVersion || disposed;
}

function disposeLoadedAssets(loadedAssets: Map<string, AssetDecoder>, current?: OpenedMediaInput) {
  current?.dispose();
  for (const asset of loadedAssets.values()) asset.opened.dispose();
  loadedAssets.clear();
}

function activeAt(clip: PlaybackClipDescriptor, timelineSeconds: number) {
  return (
    timelineSeconds >= clip.timelineStartSeconds &&
    timelineSeconds < clip.timelineStartSeconds + clip.timelineDurationSeconds
  );
}

function sourceTime(clip: PlaybackClipDescriptor, timelineSeconds: number) {
  return clip.sourceInSeconds + (timelineSeconds - clip.timelineStartSeconds) * clip.playbackRate;
}

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
    reportPlaybackWorkerError('Canvas iterator cleanup failed.', error);
  }
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
    if (iteratorGeneration !== consumer.iteratorGeneration || disposed) return;
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

async function processTicks() {
  if (processingTick || processingSeek) return;
  processingTick = true;
  try {
    while (pendingTick && !disposed) {
      const request = pendingTick;
      pendingTick = null;
      if (request.generation !== generation) continue;
      const activeConsumers = [...consumers.values()].filter((consumer) =>
        activeAt(consumer.clip, request.timelineSeconds),
      );
      const decoded = await Promise.allSettled(
        activeConsumers.map(async (consumer) => ({
          consumer,
          frame: await sequentialFrame(consumer, sourceTime(consumer.clip, request.timelineSeconds)),
        })),
      );
      const failure = decoded.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failure) {
        for (const result of decoded)
          if (result.status === 'fulfilled' && result.value.frame) closeFrame(result.value.frame, true);
        throw failure.reason;
      }
      for (const result of decoded) {
        if (result.status === 'rejected') continue;
        const { consumer, frame } = result.value;
        if (!frame || request.generation !== generation) {
          if (frame) closeFrame(frame, true);
          continue;
        }
        transferFrame(consumer, frame, request.generation);
      }
      postMetrics(request.generation);
    }
  } catch (error) {
    postError(mediaError(error, 'playback'), generation);
  } finally {
    processingTick = false;
    resolveProcessingIdle();
    if (pendingSeek) void processSeeks();
    else if (pendingTick) void processTicks();
  }
}

async function processSeeks() {
  if (processingSeek || processingTick) return;
  processingSeek = true;
  let activeRequest: Extract<PlaybackWorkerRequest, { type: 'seek' }> | null = null;
  try {
    while (pendingSeek && !disposed) {
      const request = pendingSeek;
      activeRequest = request;
      pendingSeek = null;
      const startedAt = performance.now();
      const activeConsumers = [...consumers.values()].filter((consumer) =>
        activeAt(consumer.clip, request.timelineSeconds),
      );
      const decoded = await Promise.allSettled(
        activeConsumers.map(async (consumer) => {
          const targetSeconds = sourceTime(consumer.clip, request.timelineSeconds);
          let wrapped = await consumer.sink.getCanvas(targetSeconds);
          if (!wrapped) {
            const iterator = consumer.sink.canvases(targetSeconds)[Symbol.asyncIterator]();
            try {
              const first = await iterator.next();
              wrapped = first.done ? null : first.value;
            } finally {
              await iterator.return?.();
            }
          }
          return wrapped ? { consumer, frame: await bitmapFor(wrapped) } : null;
        }),
      );
      const failure = decoded.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failure) {
        for (const result of decoded)
          if (result.status === 'fulfilled' && result.value) closeFrame(result.value.frame, true);
        throw failure.reason;
      }
      const frames = decoded.flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : []));
      if (activeConsumers.length > 0 && frames.length === 0) {
        throw new MediaInputError({
          kind: 'decode-failure',
          sourceId: 'playback',
          message: 'No video frame is available at the requested time.',
        });
      }
      if (request.generation !== generation || pendingSeek) {
        const canPresentScrubPreview = request.mode === 'scrub' && pendingSeek !== null;
        for (const { consumer, frame } of frames) {
          if (canPresentScrubPreview) transferFrame(consumer, frame, request.generation, request.requestId);
          else closeFrame(frame, true);
        }
        supersede(request, performance.now() - startedAt);
        continue;
      }
      for (const { consumer, frame } of frames) transferFrame(consumer, frame, request.generation, request.requestId);
      const latencyMs = performance.now() - startedAt;
      metrics.seekLatencyMs.push(latencyMs);
      if (metrics.seekLatencyMs.length > 100) metrics.seekLatencyMs.shift();
      post({
        type: 'seek-result',
        generation: request.generation,
        requestId: request.requestId,
        result: 'presented',
        latencyMs,
      });
      postMetrics(request.generation);
      activeRequest = null;
    }
  } catch (error) {
    reportPlaybackWorkerError('Seek failed.', mediaError(error, 'playback'));
    postError(mediaError(error, 'playback'), activeRequest?.generation ?? generation, activeRequest?.requestId);
  } finally {
    processingSeek = false;
    resolveProcessingIdle();
    if (pendingSeek) void processSeeks();
    else if (pendingTick) void processTicks();
  }
}

function transferFrame(consumer: ClipConsumer, frame: QueuedFrame, frameGeneration: number, requestId?: number) {
  const message: PlaybackFrameMessage = {
    type: 'frame',
    generation: frameGeneration,
    requestId,
    clipId: consumer.clip.clipId,
    assetId: consumer.asset.assetId,
    bitmap: frame.bitmap,
    timestampSeconds: frame.timestampSeconds,
    durationSeconds: frame.durationSeconds,
  };
  assertPlaybackWorkerResponse(message);
  metrics.presentedFrames += 1;
  self.postMessage(message, { transfer: [frame.bitmap] });
}

function supersede(request: Extract<PlaybackWorkerRequest, { type: 'seek' }>, latencyMs = 0) {
  metrics.supersededRequests += 1;
  post({
    type: 'seek-result',
    generation: request.generation,
    requestId: request.requestId,
    result: 'superseded',
    latencyMs,
  });
}

function updateQueueMetric() {
  metrics.queueSize = [...consumers.values()].reduce((size, consumer) => size + consumer.queue.length, 0);
}

function postMetrics(messageGeneration: number) {
  updateQueueMetric();
  post({
    type: 'metrics',
    generation: messageGeneration,
    metrics: { ...metrics, seekLatencyMs: [...metrics.seekLatencyMs] },
  });
}

function mediaError(error: unknown, sourceId: string): MediaError {
  if (error instanceof MediaInputError) return error.detail;
  return {
    kind: 'decode-failure',
    sourceId,
    message: error instanceof Error ? error.message : 'Playback decoding failed.',
  };
}

function postError(error: MediaError, messageGeneration = generation, requestId?: number) {
  post({ type: 'error', generation: messageGeneration, error, requestId });
}

function post(message: PlaybackWorkerResponse) {
  assertPlaybackWorkerResponse(message);
  self.postMessage(message);
}

async function disposeAll(invalidateLoad = true) {
  if (invalidateLoad) loadVersion += 1;
  pendingSeek = null;
  pendingTick = null;
  const iteratorCleanups: Promise<void>[] = [];
  for (const consumer of consumers.values()) {
    iteratorCleanups.push(closeIterator(consumer.iterator));
    consumer.iteratorGeneration += 1;
    for (const frame of consumer.queue) closeFrame(frame);
  }
  consumers.clear();
  for (const asset of assets.values()) asset.opened.dispose();
  assets.clear();
  updateQueueMetric();
  await Promise.all(iteratorCleanups);
}

function waitForProcessingIdle() {
  if (!processingSeek && !processingTick) return Promise.resolve();
  return new Promise<void>((resolve) => processingIdleWaiters.add(resolve));
}

function resolveProcessingIdle() {
  if (processingSeek || processingTick) return;
  for (const resolve of processingIdleWaiters) resolve();
  processingIdleWaiters.clear();
}

async function shutdown() {
  await disposeAll();
  await waitForProcessingIdle();
  await Promise.allSettled([...loadTasks]);
  // Let Mediabunny's iterator pumps observe disposal and synchronously close
  // their WebCodecs decoders before the renderer terminates this worker.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  post({ type: 'disposed', generation });
}
