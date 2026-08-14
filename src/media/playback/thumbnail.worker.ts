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
    const canvasSink = await sinkFor(request.source);
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

async function sinkFor(source: MediaSourceDescriptor): Promise<CanvasSink> {
  const key = `${source.assetId}:${source.url}`;
  if (sink && sourceKey === key) return sink;
  disposeDecoder();
  sourceKey = key;
  opened = await openMediaInput(source);
  const track = await opened.input.getPrimaryVideoTrack();
  const canDecode = track ? await track.canDecode() : false;
  if (!track || !canDecode || typeof VideoDecoder === 'undefined') {
    disposeDecoder();
    throw new Error('WebCodecs cannot decode this video source.');
  }
  const decoderConfig = await track.getDecoderConfig();
  const configSupported = decoderConfig ? (await VideoDecoder.isConfigSupported(decoderConfig)).supported : false;
  if (!decoderConfig || !configSupported) {
    disposeDecoder();
    throw new Error('This video codec is not supported by WebCodecs.');
  }
  sink = new CanvasSink(track, { width: THUMBNAIL_WIDTH, poolSize: 2 });
  return sink;
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

function disposeDecoder() {
  sink = null;
  opened?.dispose();
  opened = null;
  sourceKey = null;
}

function post(message: ThumbnailWorkerResponse) {
  assertThumbnailWorkerResponse(message);
  self.postMessage(message);
}
