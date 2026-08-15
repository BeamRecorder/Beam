import type { CaptionWord } from '~/media/shared/composition-types';
import type { TranscriptionDiagnostics } from './whisper-types';

export interface WhisperTranscribeRequest {
  type: 'transcribe';
  id: string;
  model: string;
  audio: Float32Array;
  sampleRate: number;
  locale: string;
}

export type WhisperWorkerEvent =
  | {
      type: 'progress';
      id: string;
      status: 'loading' | 'running';
      message: string;
      progress?: number;
    }
  | {
      type: 'diagnostics';
      id: string;
      diagnostics: Partial<TranscriptionDiagnostics>;
    }
  | { type: 'partial'; id: string; words: CaptionWord[] }
  | { type: 'result'; id: string; words: CaptionWord[] }
  | { type: 'error'; id: string; message: string; diagnostics?: Partial<TranscriptionDiagnostics> };
