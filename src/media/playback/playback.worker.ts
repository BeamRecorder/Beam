import { createPlaybackFrameQueue } from './playback-frame-queue';
import { PlaybackConsumerWindow } from './playback-consumer-window';
import { MediaInputError, type MediaError } from '../shared';
import { assertPlaybackWorkerRequest, assertPlaybackWorkerResponse } from './playback-protocol';
import type { PreviewQuality } from './playback-preview';
import { loadPlaybackAsset } from './playback-worker-assets';
import type {
  PlaybackFrameMessage,
  PlaybackMetrics,
  PlaybackWorkerRequest,
  PlaybackWorkerResponse,
} from './playback-types';
import {
  createPlaybackConsumer,
  createPlaybackSink,
  disposeLoadedAssets,
  shouldDecodeTickFrame,
  sourceTime,
  type AssetDecoder,
  type ClipConsumer,
  type QueuedFrame,
} from './playback-worker-consumers';
const reportPlaybackWorkerError = (message: string, error?: unknown) =>
  console.error(`[Beam media:playback-worker] ${message}`, error ?? '');

const assets = new Map<string, AssetDecoder>();
const consumers = new Map<string, ClipConsumer>();
const consumerWindow = new PlaybackConsumerWindow();
let generation = 0;
let disposed = false;
let pendingSeek: Extract<PlaybackWorkerRequest, { type: 'seek' }> | null = null;
let processingSeek = false;
let pendingTick: Extract<PlaybackWorkerRequest, { type: 'tick' }> | null = null;
let processingTick = false;
let loadVersion = 0;
let previewQuality: PreviewQuality = 'full';
const loadTasks = new Set<Promise<void>>();
const processingIdleWaiters = new Set<() => void>();
const METRICS_INTERVAL_MS = 250;
let lastMetricsGeneration = -1;
let lastMetricsPostedAt = Number.NEGATIVE_INFINITY;

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

const { bitmapFor, closeFrame, closeIterator, resetConsumer, sequentialFrame } = createPlaybackFrameQueue(
  metrics,
  () => disposed,
  updateQueueMetric,
  reportPlaybackWorkerError,
);

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
  } else if (message.type === 'retime') {
    const task = retime(message);
    loadTasks.add(task);
    void task.finally(() => loadTasks.delete(task));
  } else if (message.type === 'configure-preview') {
    const task = configurePreview(message);
    loadTasks.add(task);
    void task.finally(() => loadTasks.delete(task));
  } else if (message.type === 'seek') {
    if (pendingSeek) supersede(pendingSeek);
    pendingSeek = message;
    void processSeeks();
  } else if (message.type === 'cancel-seek') {
    void cancelSeek(message);
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

async function cancelSeek(message: Extract<PlaybackWorkerRequest, { type: 'cancel-seek' }>) {
  if (pendingSeek) supersede(pendingSeek);
  pendingSeek = null;
  pendingTick = null;
  await waitForProcessingIdle();
  if (disposed || generation !== message.generation || processingSeek || processingTick) return;
  if (!consumerWindow.resident.size) return;
  // Cached scrubs also end sequential prefetch. Serialize cleanup with decode;
  // returning an iterator while next() is pending can close its live surfaces.
  processingSeek = true;
  try {
    await consumerWindow.prepare([], resetConsumer, previewQuality);
    postMetrics(message.generation, true);
  } finally {
    processingSeek = false;
    resolveProcessingIdle();
    if (pendingSeek) void processSeeks();
    else if (pendingTick) void processTicks();
  }
}

async function configurePreview(message: Extract<PlaybackWorkerRequest, { type: 'configure-preview' }>) {
  const version = ++loadVersion;
  if (pendingSeek) supersede(pendingSeek);
  pendingSeek = null;
  pendingTick = null;
  await waitForProcessingIdle();
  if (isStaleLoad(version)) return;
  try {
    await Promise.all([...consumers.values()].map(resetConsumer));
    if (isStaleLoad(version)) return;
    previewQuality = message.previewQuality;
    for (const consumer of consumers.values()) consumer.sink = createPlaybackSink(consumer.asset, previewQuality);
    updateQueueMetric();
    post({ type: 'ready', generation: message.generation });
  } catch (error) {
    if (!isStaleLoad(version)) postError(mediaError(error, 'playback'), message.generation);
  }
}

async function retime(message: Extract<PlaybackWorkerRequest, { type: 'retime' }>) {
  const version = ++loadVersion;
  pendingSeek = null;
  pendingTick = null;
  await waitForProcessingIdle();
  if (isStaleLoad(version)) return;
  try {
    // Validate the whole update before releasing or changing the current timeline.
    for (const clip of message.clips) {
      const existing = consumers.get(clip.clipId);
      if (existing && existing.asset.assetId !== clip.assetId)
        throw new Error('Playback asset changed during a timing-only update.');
      if (!assets.has(clip.assetId)) throw new Error('Playback asset is unavailable during a timing-only update.');
    }
    await Promise.all([...consumers.values()].map(resetConsumer));
    if (isStaleLoad(version)) return;
    const next = message.clips.map(
      (clip) => consumers.get(clip.clipId) ?? createPlaybackConsumer(clip, assets.get(clip.assetId)!, previewQuality),
    );
    consumers.clear();
    next.forEach((consumer, index) => {
      consumer.clip = message.clips[index]!;
      consumers.set(consumer.clip.clipId, consumer);
    });
    consumerWindow.rebuild(consumers.values());
    updateQueueMetric();
    post({ type: 'ready', generation: message.generation });
  } catch (error) {
    if (isStaleLoad(version)) return;
    postError(mediaError(error, 'playback'), message.generation);
  }
}

async function load(message: Extract<PlaybackWorkerRequest, { type: 'load' }>) {
  const version = ++loadVersion;
  previewQuality = message.previewQuality;
  await disposeAll(false);
  await waitForProcessingIdle();
  if (isStaleLoad(version)) return;
  const loadedAssets = new Map<string, AssetDecoder>();
  let committed = false;
  try {
    for (const descriptor of message.assets) {
      const asset = await loadPlaybackAsset(descriptor, () => isStaleLoad(version));
      if (!asset) return disposeLoadedAssets(loadedAssets);
      loadedAssets.set(descriptor.assetId, asset);
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
      consumers.set(clip.clipId, createPlaybackConsumer(clip, asset, previewQuality));
    }
    consumerWindow.rebuild(consumers.values());
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

async function processTicks() {
  if (processingTick || processingSeek) return;
  processingTick = true;
  let requestGeneration = generation;
  try {
    while (pendingTick && !disposed) {
      const request = pendingTick;
      pendingTick = null;
      if (request.generation !== generation) continue;
      requestGeneration = request.generation;
      const activeConsumers = consumerWindow.select(request.timelineSeconds, true);
      await consumerWindow.prepare(activeConsumers, resetConsumer, previewQuality);
      if (disposed || request.generation !== generation) continue;
      const decoded = await Promise.allSettled(
        activeConsumers.map(async (consumer) => {
          const sampleTimelineSeconds = Math.max(request.timelineSeconds, consumer.clip.timelineStartSeconds);
          const targetSeconds = sourceTime(consumer.clip, sampleTimelineSeconds);
          return {
            consumer,
            frame: shouldDecodeTickFrame(consumer, targetSeconds)
              ? await sequentialFrame(consumer, targetSeconds)
              : null,
          };
        }),
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
    postError(mediaError(error, 'playback'), requestGeneration);
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
      const activeConsumers = consumerWindow.select(request.timelineSeconds);
      // Arbitrary access replaces sequential playback. Release its prefetched
      // bitmaps and decoder before opening a separate seek decoder.
      await consumerWindow.prepare(activeConsumers, resetConsumer, previewQuality, true);
      if (disposed) break;
      if (request.generation !== generation && !pendingSeek) {
        supersede(request);
        continue;
      }
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
      postMetrics(request.generation, true);
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
  metrics.queueSize = [...consumerWindow.resident].reduce((size, consumer) => size + consumer.queue.length, 0);
}

function postMetrics(messageGeneration: number, force = false) {
  const now = performance.now();
  if (!force && messageGeneration === lastMetricsGeneration && now - lastMetricsPostedAt < METRICS_INTERVAL_MS) return;
  lastMetricsGeneration = messageGeneration;
  lastMetricsPostedAt = now;
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
  consumerWindow.clear();
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
  await Promise.allSettled(loadTasks);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  post({ type: 'disposed', generation });
}
