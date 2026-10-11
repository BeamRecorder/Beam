import type { Ref } from 'vue';
import type { RecordingPhase } from './recording-types';

export interface PausableRecorder {
  pause(sessionNs: number | undefined): Promise<unknown>;
  resume(sessionId: string): Promise<unknown>;
}
export interface RecordingPauseContext {
  phase: Ref<RecordingPhase>;
  error: Ref<string>;
  sessionId(): string | null;
  recorders(): Array<PausableRecorder | null>;
  timelineNowNs(): number | undefined;
  pause(): Promise<unknown>;
  resume(): Promise<unknown>;
  stop(): Promise<void>;
  clearTimer(): void;
  startTimer(): void;
  resetSystemAudioLevel(): void;
}
