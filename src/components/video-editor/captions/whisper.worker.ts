/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers'

type Request = { type: 'transcribe'; id: string; model: string; audio: Float32Array; sampleRate: number }
type Chunk = { text?: string; timestamp?: [number, number] }
type TranscriptionOptions = { sampling_rate: number; return_timestamps: 'word'; language?: 'french'; task?: 'transcribe' }
type Transcriber = (audio: Float32Array, options: TranscriptionOptions) => Promise<{ chunks?: Chunk[] }>
let loadedModel = ''
let transcriber: Transcriber | null = null
env.allowRemoteModels = false
env.allowLocalModels = true
env.localModelPath = 'whisper-model://models/'
// Models are persisted and integrity-checked by Electron. Cache Storage does
// not support our custom protocol and would only produce warnings.
env.useBrowserCache = false

const formatTime = (seconds: number) => {
  const rounded = Math.max(0, Math.round(seconds))
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`
}
const formatMegabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
const TRANSCRIPTION_CHUNK_SECONDS = 5

self.onmessage = async ({ data }: MessageEvent<Request>) => {
  if (data.type !== 'transcribe') return
  try {
    const device = navigator.gpu ? 'webgpu' : 'wasm'
    if (!transcriber || loadedModel !== data.model) {
      self.postMessage({ type: 'progress', id: data.id, status: 'loading', message: `Loading ${data.model} (${device})…` })
      transcriber = await pipeline('automatic-speech-recognition', data.model, {
        device,
        dtype: 'q8',
        progress_callback: (event: { progress?: number; status?: string; file?: string; loaded?: number; total?: number }) => {
          const byteProgress = event.loaded !== undefined && event.total !== undefined
            ? `Loading model — ${formatMegabytes(event.loaded)} / ${formatMegabytes(event.total)}`
            : event.status === 'ready' ? 'Model ready; preparing transcription…' : event.file ? `Loading ${event.file}` : 'Loading model…'
          self.postMessage({ type: 'progress', id: data.id, status: 'loading', message: byteProgress, progress: event.progress })
        },
      }) as unknown as Transcriber
      loadedModel = data.model
    }
    const totalSeconds = data.audio.length / data.sampleRate
    const chunkSamples = data.sampleRate * TRANSCRIPTION_CHUNK_SECONDS
    const chunkCount = Math.ceil(data.audio.length / chunkSamples)
    const words: Array<{ text: string; startMs: number; endMs: number }> = []
    const transcriptionOptions: TranscriptionOptions = {
      sampling_rate: data.sampleRate,
      return_timestamps: 'word',
      ...(data.model.endsWith('.en') ? {} : { language: 'french', task: 'transcribe' }),
    }
    for (let offset = 0; offset < data.audio.length; offset += chunkSamples) {
      const chunkIndex = Math.floor(offset / chunkSamples)
      const processedSeconds = Math.min(totalSeconds, (offset + chunkSamples) / data.sampleRate)
      self.postMessage({ type: 'progress', id: data.id, status: 'running', message: `Transcribing segment ${chunkIndex + 1}/${chunkCount} — ${formatTime(offset / data.sampleRate)} / ${formatTime(totalSeconds)}`, progress: (offset / data.audio.length) * 100 })
      const result = await transcriber(data.audio.subarray(offset, offset + chunkSamples), transcriptionOptions)
      const offsetMs = Math.round((offset / data.sampleRate) * 1000)
      words.push(...(result.chunks || []).flatMap((chunk) => chunk.timestamp && chunk.text ? [{ text: chunk.text.trim(), startMs: offsetMs + Math.round(chunk.timestamp[0] * 1000), endMs: offsetMs + Math.round(chunk.timestamp[1] * 1000) }] : []))
      self.postMessage({ type: 'progress', id: data.id, status: 'running', message: `Transcribed ${chunkIndex + 1}/${chunkCount} segments — ${formatTime(processedSeconds)} / ${formatTime(totalSeconds)}`, progress: (processedSeconds / totalSeconds) * 100 })
    }
    self.postMessage({ type: 'result', id: data.id, words })
  } catch (error) { self.postMessage({ type: 'error', id: data.id, message: error instanceof Error ? error.message : 'Whisper failed.' }) }
}
