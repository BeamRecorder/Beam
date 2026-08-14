import type { CaptionSentence, CaptionWord } from '~/media/shared/composition-types';
import { tNamespace } from '~/i18n';

const $t = tNamespace('whisperTypes');

export type WhisperModelId =
  | 'Xenova/whisper-tiny'
  | 'Xenova/whisper-tiny.en'
  | 'Xenova/whisper-base'
  | 'Xenova/whisper-base.en'
  | 'Xenova/whisper-small'
  | 'Xenova/whisper-small.en'
  | 'Xenova/whisper-medium'
  | 'Xenova/whisper-medium.en'
  | 'Xenova/whisper-large-v3';
export type TranscriptionSource = 'system' | 'microphone' | `media:${string}`;
export interface WhisperModel {
  id: WhisperModelId;
  label: string;
  languages: string;
  warning?: string;
}
export interface WhisperProgress {
  status: 'idle' | 'loading' | 'running' | 'error';
  message: string;
  progress?: number;
}
export interface WhisperResult {
  words: CaptionWord[];
  sentences: CaptionSentence[];
}

export const whisperModels: WhisperModel[] = [
  { id: 'Xenova/whisper-tiny', label: $t('models.tiny'), languages: $t('languages.multilingual') },
  { id: 'Xenova/whisper-tiny.en', label: $t('models.tinyEn'), languages: $t('languages.english') },
  { id: 'Xenova/whisper-base', label: $t('models.base'), languages: $t('languages.multilingual') },
  { id: 'Xenova/whisper-base.en', label: $t('models.baseEn'), languages: $t('languages.english') },
  {
    id: 'Xenova/whisper-small',
    label: $t('models.small'),
    languages: $t('languages.multilingual'),
    warning: $t('warnings.slow'),
  },
  {
    id: 'Xenova/whisper-small.en',
    label: $t('models.smallEn'),
    languages: $t('languages.english'),
    warning: $t('warnings.slow'),
  },
  {
    id: 'Xenova/whisper-medium',
    label: $t('models.medium'),
    languages: $t('languages.multilingual'),
    warning: $t('warnings.large'),
  },
  {
    id: 'Xenova/whisper-medium.en',
    label: $t('models.mediumEn'),
    languages: $t('languages.english'),
    warning: $t('warnings.large'),
  },
  {
    id: 'Xenova/whisper-large-v3',
    label: $t('models.largeV3'),
    languages: $t('languages.multilingual'),
    warning: $t('warnings.veryLarge'),
  },
];
