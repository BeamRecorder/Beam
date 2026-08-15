import { CanvasSink } from 'mediabunny';
import { openMediaInput, type MediaSourceDescriptor, type OpenedMediaInput } from '../shared';
import {
  THUMBNAIL_WIDTH,
  assertThumbnailWorkerResponse,
  isThumbnailWorkerRequest,
  uniqueSortedTimes,
  type ThumbnailRequest,
  type ThumbnailWorkerRequest,
  type ThumbnailWorkerResponse,
} from './thumbnail-protocol';

let latestGeneration = 0;
let pendingRequest: ThumbnailRequest | null = null;
let processing = false;
let sourceKey: string | null = null;
let opened: OpenedMediaInput | null = null;
let sink: CanvasSink | null = null;
let decoderVersion = 0;

self.onmessage = (event: MessageEvent<unknown>) => {
  if (!isThumbnailWorkerRequest(event.data)) return;
  receiveRequest(event.data);
};

function receiveRequest(message: ThumbnailWorkerRequest) {
  latestGeneration = Math.max(latestGeneration, message.generation);
  if (message.type === 'clear') {
    pendingRequest = null;
    disposeDecoder();
    return;
  }
  pendingRequest = {
    ...message,
    visibleTimes: uniqueSortedTimes(message.visibleTimes),
  };
  void processRequests();
}

async function processRequests() {
  if (processing) return;
  processing = true;
  try {
    while (pendingRequest) {
      const request = pendingRequest;
      pendingRequest = null;
      post({ type: 'batch-started', generation: request.generation });
      await decodeBatch(request);
      if (request.generation === latestGeneration) {
        post({ type: 'batch-finished', generation: request.generation });
      }
    }
  } finally {
    processing = false;
  }
}

async function decodeBatch(request: ThumbnailRequest) {
  try {
    const canvasSink = await sinkFor(request.source, request.generation);
    if (!canvasSink || isStale(request.generation)) return;
    let index = 0;
    for await (const wrappedCanvas of canvasSink.canvasesAtTimestamps(request.visibleTimes)) {
      const time = request.visibleTimes[index];
      index += 1;
      if (time === undefined || isStale(request.generation)) return;
      if (!wrappedCanvas) continue;
      const blob = await canvasToJpeg(wrappedCanvas.canvas);
      if (!isStale(request.generation)) {
        post({ type: 'frame-ready', generation: request.generation, time, blob });
      }
    }
  } catch (error) {
    if (!isStale(request.generation)) {
      console.error('[Beam media:thumbnail-worker] Thumbnail batch failed.', error);
      post({
        type: 'error',
        generation: request.generation,
        message: error instanceof Error ? error.message : 'Thumbnail decoding failed.',
      });
    }
  }
}

async function sinkFor(source: MediaSourceDescriptor, requestGeneration: number): Promise<CanvasSink | null> {
  const key = `${source.assetId}:${source.url}`;
  if (sink && sourceKey === key) return sink;
  const version = ++decoderVersion;
  releaseDecoder();
  let candidate: OpenedMediaInput | null = null;
  try {
    candidate = await openMediaInput(source);
    if (decoderIsStale(version, requestGeneration)) {
      candidate.dispose();
      return null;
    }
    const track = await candidate.input.getPrimaryVideoTrack();
    if (decoderIsStale(version, requestGeneration)) {
      candidate.dispose();
      return null;
    }
    const canDecode = track ? await track.canDecode() : false;
    if (decoderIsStale(version, requestGeneration)) {
      candidate.dispose();
      return null;
    }
    if (!track || !canDecode || typeof VideoDecoder === 'undefined') {
      throw new Error('WebCodecs cannot decode this video source.');
    }
    const decoderConfig = await track.getDecoderConfig();
    if (decoderIsStale(version, requestGeneration)) {
      candidate.dispose();
      return null;
    }
    const configSupported = decoderConfig ? (await VideoDecoder.isConfigSupported(decoderConfig)).supported : false;
    if (decoderIsStale(version, requestGeneration)) {
      candidate.dispose();
      return null;
    }
    if (!decoderConfig || !configSupported) {
      throw new Error('This video codec is not supported by WebCodecs.');
    }
    const nextSink = new CanvasSink(track, { width: THUMBNAIL_WIDTH, poolSize: 2 });
    opened = candidate;
    candidate = null;
    sink = nextSink;
    sourceKey = key;
    return nextSink;
  } catch (error) {
    candidate?.dispose();
    if (version === decoderVersion) releaseDecoder();
    throw error;
  }
}

async function canvasToJpeg(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if (!('convertToBlob' in canvas)) {
    throw new Error('Thumbnail worker did not receive an OffscreenCanvas.');
  }
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 });
}

function isStale(generation: number) {
  return generation !== latestGeneration;
}

function decoderIsStale(version: number, generation: number) {
  return version !== decoderVersion || isStale(generation);
}

function disposeDecoder() {
  decoderVersion += 1;
  releaseDecoder();
}

function releaseDecoder() {
  sink = null;
  opened?.dispose();
  opened = null;
  sourceKey = null;
}

function post(message: ThumbnailWorkerResponse) {
  assertThumbnailWorkerResponse(message);
  self.postMessage(message);
}
