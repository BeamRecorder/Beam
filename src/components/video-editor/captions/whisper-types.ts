import type { CaptionSentence, CaptionWord } from '../composition/composition-types'

export type WhisperModelId = 'Xenova/whisper-tiny' | 'Xenova/whisper-tiny.en' | 'Xenova/whisper-base' | 'Xenova/whisper-base.en' | 'Xenova/whisper-small' | 'Xenova/whisper-small.en' | 'Xenova/whisper-medium' | 'Xenova/whisper-medium.en' | 'Xenova/whisper-large-v3'
export type TranscriptionSource = 'system' | 'microphone' | `media:${string}`
export interface WhisperModel { id: WhisperModelId; label: string; languages: string; warning?: string }
export interface WhisperProgress { status: 'idle' | 'loading' | 'running' | 'error'; message: string; progress?: number }
export interface WhisperResult { words: CaptionWord[]; sentences: CaptionSentence[] }

export const whisperModels: WhisperModel[] = [
  { id: 'Xenova/whisper-tiny', label: 'Tiny', languages: 'Multilingual' }, { id: 'Xenova/whisper-tiny.en', label: 'Tiny .en', languages: 'English' },
  { id: 'Xenova/whisper-base', label: 'Base', languages: 'Multilingual' }, { id: 'Xenova/whisper-base.en', label: 'Base .en', languages: 'English' },
  { id: 'Xenova/whisper-small', label: 'Small', languages: 'Multilingual', warning: 'May be slow without WebGPU.' }, { id: 'Xenova/whisper-small.en', label: 'Small .en', languages: 'English', warning: 'May be slow without WebGPU.' },
  { id: 'Xenova/whisper-medium', label: 'Medium', languages: 'Multilingual', warning: 'Large download; WebGPU recommended.' }, { id: 'Xenova/whisper-medium.en', label: 'Medium .en', languages: 'English', warning: 'Large download; WebGPU recommended.' },
  { id: 'Xenova/whisper-large-v3', label: 'Large v3', languages: 'Multilingual', warning: 'Very large and slow without WebGPU.' },
]
