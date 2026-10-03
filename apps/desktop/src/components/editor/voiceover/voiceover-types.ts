import type { CaptureSource } from '~/api/types/capture-api';

export type VoiceoverPhase = 'idle' | 'preparing' | 'countdown' | 'recording' | 'paused' | 'finalizing' | 'error';

export interface VoiceoverDraft {
  startMs: number;
  durationMs: number;
  bars: number[];
}

export interface VoiceoverRecorderState {
  phase: VoiceoverPhase;
  microphones: CaptureSource[];
  selectedMicrophoneId: string | null;
  countdownSeconds: number;
  countdownRemaining: number;
  monitorProjectAudio: boolean;
  elapsedLabel: string;
  previewBars: number[];
  draft: VoiceoverDraft | null;
  error: string | null;
}
