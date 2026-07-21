import { onBeforeUnmount, ref } from 'vue'
import type { CaptionSentence, CaptionWord } from '../composition/composition-types'
import type { WhisperModelId, WhisperProgress, WhisperResult } from './whisper-types'

const sentencesFromWords = (words: CaptionWord[]): CaptionSentence[] => {
  const groups: CaptionWord[][] = []; let group: CaptionWord[] = []
  for (const word of words) { group.push(word); if (/[.!?]$/.test(word.text) || group.length >= 12) { groups.push(group); group = [] } }
  if (group.length) groups.push(group)
  return groups.map((items) => ({ id: crypto.randomUUID(), text: items.map((word) => word.text).join(' '), startMs: items[0].startMs, endMs: items.at(-1)!.endMs, words: items }))
}

const mono = async (src: string) => {
  const response = await fetch(src); if (!response.ok) throw new Error('Unable to read selected audio source.')
  const context = new AudioContext(); const buffer = await context.decodeAudioData(await response.arrayBuffer()); const channel = buffer.getChannelData(0); await context.close()
  return { samples: new Float32Array(channel), sampleRate: buffer.sampleRate }
}

export function useWhisperTranscription() {
  const progress = ref<WhisperProgress>({ status: 'idle', message: '' }); let worker: Worker | null = null
  const transcribe = async (src: string, model: WhisperModelId): Promise<WhisperResult> => {
    const input = await mono(src); worker ??= new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' }); const activeWorker = worker; const id = crypto.randomUUID()
    return new Promise((resolve, reject) => { const onMessage = ({ data }: MessageEvent) => { if (data.id !== id) return; if (data.type === 'progress') progress.value = { status: data.status, message: data.message, progress: data.progress }; if (data.type === 'result') { activeWorker.removeEventListener('message', onMessage); progress.value = { status: 'idle', message: '' }; const words = data.words as CaptionWord[]; resolve({ words, sentences: sentencesFromWords(words) }) } if (data.type === 'error') { activeWorker.removeEventListener('message', onMessage); progress.value = { status: 'error', message: data.message }; reject(new Error(data.message)) } }; activeWorker.addEventListener('message', onMessage); activeWorker.postMessage({ type: 'transcribe', id, model, audio: input.samples, sampleRate: input.sampleRate }, [input.samples.buffer]) })
  }
  onBeforeUnmount(() => worker?.terminate())
  return { progress, transcribe }
}
