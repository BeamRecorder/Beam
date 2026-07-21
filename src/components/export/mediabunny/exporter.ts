import { AudioBufferSource, CanvasSource, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec, Mp4OutputFormat, Output, StreamTarget, WebMOutputFormat } from 'mediabunny'
import { bitrateFor } from '../export-presets'
import type { ExportProgress, ExportRequest, ExportResult } from '../export-types'
import { renderCompositionFrame } from '../composition/render'

const codecCandidates = { webm: ['vp9', 'vp8', 'av1'], mp4: ['avc'] } as const
const audioCodecCandidates = { webm: ['opus'], mp4: ['aac'] } as const

export async function supportedVideoCodec(request: ExportRequest) {
  const { video } = request.snapshot
  return getFirstEncodableVideoCodec([...codecCandidates[request.format]], {
    width: video.width, height: video.height, bitrate: bitrateFor(request.preset, video.width, video.height, video.fps),
  })
}

export async function supportedAudioCodec(request: ExportRequest) {
  if (request.snapshot.audio.length === 0) return null
  return getFirstEncodableAudioCodec([...audioCodecCandidates[request.format]], { sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000 })
}

export async function renderMixedAudio(request: ExportRequest): Promise<AudioBuffer | null> {
  const layers = request.snapshot.audio.filter((layer) => layer.enabled)
  if (layers.length === 0) return null
  if (!window.OfflineAudioContext) throw new Error('Offline audio mixing is unavailable in this Chromium build.')
  const context = new OfflineAudioContext(2, Math.max(1, Math.ceil(request.snapshot.duration * 48_000)), 48_000)
  await Promise.all(layers.map(async (layer) => {
    const response = await fetch(layer.src)
    if (!response.ok) throw new Error(`Unable to read the audio sidecar: ${layer.src}`)
    const buffer = await context.decodeAudioData(await response.arrayBuffer())
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    source.start(Math.max(0, layer.startSeconds))
  }))
  return context.startRendering()
}

const waitFor = (target: HTMLMediaElement, event: 'loadedmetadata' | 'seeked') => new Promise<void>((resolve, reject) => {
  const done = () => { cleanup(); resolve() }
  const failed = () => { cleanup(); reject(new Error('Impossible de lire la vidéo source.')) }
  const cleanup = () => { target.removeEventListener(event, done); target.removeEventListener('error', failed) }
  target.addEventListener(event, done, { once: true }); target.addEventListener('error', failed, { once: true })
})

async function loadBackground(request: ExportRequest): Promise<HTMLImageElement | HTMLVideoElement | null> {
  const background = request.snapshot.background
  if (!background?.src) return null
  if (background.kind === 'image' || background.kind === 'gif') {
    const image = new Image(); image.src = background.src
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Impossible de charger le fond.')) })
    return image
  }
  const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; video.src = background.src; video.load()
  await waitFor(video, 'loadedmetadata')
  return video
}

async function loadCursorImages(request: ExportRequest) {
  const entries = await Promise.all(Object.entries(request.snapshot.cursor.shapes).map(async ([id, shape]) => {
    const image = new Image(); image.src = shape.src
    await new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve() })
    return [id, image] as const
  }))
  return new Map(entries)
}

export async function exportWithMediabunny(request: ExportRequest, onProgress: (progress: ExportProgress) => void, signal: AbortSignal): Promise<ExportResult> {
  const codec = await supportedVideoCodec(request)
  if (!codec) throw new Error(`${request.format.toUpperCase()} n’est pas encodable par cette machine.`)
  const audioCodec = await supportedAudioCodec(request)
  if (request.snapshot.audio.length > 0 && !audioCodec) throw new Error(`${request.format.toUpperCase()} audio is not encodable by this machine.`)
  const opened = await window.capture?.beginExport({ projectName: request.projectName, format: request.format })
  if (!opened || opened.canceled) throw new DOMException('Export annulé.', 'AbortError')
  const video = document.createElement('video')
  video.muted = true; video.preload = 'auto'; video.src = request.snapshot.video.src
  const canvas = document.createElement('canvas')
  canvas.width = request.snapshot.video.width; canvas.height = request.snapshot.video.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D indisponible.')
  let sequence = 0
  const writable = new WritableStream({
    write: (chunk: { data: Uint8Array; position: number }) => window.capture!.writeExportChunk({ jobId: opened.jobId, sequence: sequence++, data: chunk.data, position: chunk.position }),
  })
  const output = new Output({ format: request.format === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat(), target: new StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 }) })
  const source = new CanvasSource(canvas, { codec, bitrate: bitrateFor(request.preset, canvas.width, canvas.height, request.snapshot.video.fps) })
  output.addVideoTrack(source, { frameRate: request.snapshot.video.fps })
  try {
    video.load(); await waitFor(video, 'loadedmetadata')
    const background = await loadBackground(request)
    const cursorImages = await loadCursorImages(request)
    const mixedAudio = await renderMixedAudio(request)
    const audioSource = mixedAudio && audioCodec ? new AudioBufferSource({ codec: audioCodec, bitrate: 128_000 }) : null
    if (audioSource) output.addAudioTrack(audioSource)
    await output.start()
    if (audioSource && mixedAudio) await audioSource.add(mixedAudio)
    const total = Math.max(1, Math.ceil(request.snapshot.duration * request.snapshot.video.fps))
    for (let frame = 0; frame < total; frame += 1) {
      if (signal.aborted) throw new DOMException('Export annulé.', 'AbortError')
      const time = Math.min(request.snapshot.duration, frame / request.snapshot.video.fps)
      if (Math.abs(video.currentTime - time) > 0.001) {
        video.currentTime = time
        await waitFor(video, 'seeked')
      }
      if (background instanceof HTMLVideoElement && Math.abs(background.currentTime - time) > 0.001) {
        background.currentTime = time % Math.max(0.001, background.duration)
        await waitFor(background, 'seeked')
      }
      renderCompositionFrame(context, video, request.snapshot, time, background, cursorImages)
      await source.add(time, 1 / request.snapshot.video.fps)
      onProgress({ stage: 'encoding', completed: frame + 1, total })
    }
    onProgress({ stage: 'finalizing', completed: total, total })
    await output.finalize()
    const result = await window.capture!.finalizeExport(opened.jobId)
    return { path: result.path, format: request.format }
  } catch (error) {
    await output.cancel().catch(() => undefined)
    await window.capture!.abortExport(opened.jobId).catch(() => undefined)
    throw error
  } finally {
    video.removeAttribute('src'); video.load()
  }
}
