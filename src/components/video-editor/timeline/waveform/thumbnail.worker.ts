import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny'
import {
  THUMBNAIL_WIDTH,
  isThumbnailWorkerRequest,
  uniqueSortedTimes,
  type ThumbnailRequest,
  type ThumbnailWorkerRequest,
  type ThumbnailWorkerResponse,
} from './thumbnail-protocol'

let latestGeneration = 0
let pendingRequest: ThumbnailRequest | null = null
let processing = false
let sourceUrl: string | null = null
let input: Input | null = null
let sink: CanvasSink | null = null

self.onmessage = (event: MessageEvent<unknown>) => {
  if (!isThumbnailWorkerRequest(event.data)) return
  receiveRequest(event.data)
}

function receiveRequest(message: ThumbnailWorkerRequest) {
  latestGeneration = Math.max(latestGeneration, message.generation)
  if (message.type === 'clear') {
    pendingRequest = null
    disposeDecoder()
    return
  }
  pendingRequest = {
    ...message,
    visibleTimes: uniqueSortedTimes(message.visibleTimes),
  }
  void processRequests()
}

async function processRequests() {
  if (processing) return
  processing = true
  try {
    while (pendingRequest) {
      const request = pendingRequest
      pendingRequest = null
      post({ type: 'batch-started', generation: request.generation })
      await decodeBatch(request)
      if (request.generation === latestGeneration) {
        post({ type: 'batch-finished', generation: request.generation })
      }
    }
  } finally {
    processing = false
  }
}

async function decodeBatch(request: ThumbnailRequest) {
  try {
    const canvasSink = await sinkFor(request.source)
    if (!canvasSink || isStale(request.generation)) return
    let index = 0
    for await (const wrappedCanvas of canvasSink.canvasesAtTimestamps(request.visibleTimes)) {
      const time = request.visibleTimes[index]
      index += 1
      if (time === undefined || isStale(request.generation)) return
      if (!wrappedCanvas) continue
      const blob = await canvasToJpeg(wrappedCanvas.canvas)
      if (!isStale(request.generation)) {
        post({ type: 'frame-ready', generation: request.generation, time, blob })
      }
    }
  } catch (error) {
    if (!isStale(request.generation)) {
      post({
        type: 'error',
        generation: request.generation,
        message: error instanceof Error ? error.message : 'Thumbnail decoding failed.',
      })
    }
  }
}

async function sinkFor(source: string): Promise<CanvasSink> {
  if (sink && sourceUrl === source) return sink
  disposeDecoder()
  sourceUrl = source
  const response = await fetch(source)
  if (!response.ok) throw new Error(`Unable to read video source (${response.status}).`)
  input = new Input({
    source: new BlobSource(await response.blob()),
    formats: ALL_FORMATS,
  })
  const track = await input.getPrimaryVideoTrack()
  if (!track || !(await track.canDecode()) || typeof VideoDecoder === 'undefined') {
    disposeDecoder()
    throw new Error('WebCodecs cannot decode this video source.')
  }
  const decoderConfig = await track.getDecoderConfig()
  if (!decoderConfig || !(await VideoDecoder.isConfigSupported(decoderConfig)).supported) {
    disposeDecoder()
    throw new Error('This video codec is not supported by WebCodecs.')
  }
  sink = new CanvasSink(track, { width: THUMBNAIL_WIDTH, poolSize: 2 })
  return sink
}

async function canvasToJpeg(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if (!('convertToBlob' in canvas)) {
    throw new Error('Thumbnail worker did not receive an OffscreenCanvas.')
  }
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 })
}

function isStale(generation: number) {
  return generation !== latestGeneration
}

function disposeDecoder() {
  sink = null
  input?.dispose()
  input = null
  sourceUrl = null
}

function post(message: ThumbnailWorkerResponse) {
  self.postMessage(message)
}
