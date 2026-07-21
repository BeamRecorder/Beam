/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers'

type Request = { type: 'transcribe'; id: string; model: string; audio: Float32Array; sampleRate: number }
type Chunk = { text?: string; timestamp?: [number, number] }
type Transcriber = (audio: Float32Array, options: { sampling_rate: number; return_timestamps: 'word' }) => Promise<{ chunks?: Chunk[] }>
let loadedModel = ''
let transcriber: Transcriber | null = null
env.allowRemoteModels = false
env.allowLocalModels = true
env.localModelPath = 'whisper-model://models/'

self.onmessage = async ({ data }: MessageEvent<Request>) => {
  if (data.type !== 'transcribe') return
  try {
    const device = 'gpu' in navigator ? 'webgpu' : 'wasm'
    if (!transcriber || loadedModel !== data.model) {
      self.postMessage({ type: 'progress', id: data.id, status: 'loading', message: `Loading ${data.model} (${device})…` })
      transcriber = await pipeline('automatic-speech-recognition', data.model, { device, progress_callback: (event: { progress?: number; status?: string }) => self.postMessage({ type: 'progress', id: data.id, status: 'loading', message: event.status || 'Loading model…', progress: event.progress }) }) as unknown as Transcriber
      loadedModel = data.model
    }
    self.postMessage({ type: 'progress', id: data.id, status: 'running', message: 'Transcribing…' })
    const result = await transcriber(data.audio, { sampling_rate: data.sampleRate, return_timestamps: 'word' })
    const words = (result.chunks || []).flatMap((chunk) => chunk.timestamp && chunk.text ? [{ text: chunk.text.trim(), startMs: Math.round(chunk.timestamp[0] * 1000), endMs: Math.round(chunk.timestamp[1] * 1000) }] : [])
    self.postMessage({ type: 'result', id: data.id, words })
  } catch (error) { self.postMessage({ type: 'error', id: data.id, message: error instanceof Error ? error.message : 'Whisper failed.' }) }
}
