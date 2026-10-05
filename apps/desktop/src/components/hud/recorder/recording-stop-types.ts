import type { CaptureSession } from '../../../api/types/capture-api';

export interface RecordingStopOperations {
  stopNative(): Promise<CaptureSession>;
  stopSidecars(): Promise<void>;
  completeNative(): Promise<CaptureSession>;
  status(): Promise<CaptureSession>;
}

export type RecordingStopResult =
  | { kind: 'completed'; session: CaptureSession; warning: string }
  | { kind: 'active'; error: string }
  | { kind: 'failed'; error: string; cleanupBlocked: boolean };
