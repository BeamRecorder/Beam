import type { ScreenRegion, ScreenRegionOverlayOptions } from '../../../api/types/screen-region';

export type RecordingPhase = 'idle' | 'countdown' | 'recording' | 'paused' | 'finalizing';

export interface RecordingConfiguration {
  screenKind: 'display' | 'window';
  screenId?: string;
  cameraId: string;
  microphoneId: string;
  systemAudio: boolean;
  targetFps: number;
  countdownSeconds: number;
  recordingBarVisibility: 'always' | 'auto-fade';
  region?: ScreenRegion | null;
  regionOverlay?: ScreenRegionOverlayOptions | null;
}

export interface RecordingSessionResult {
  videoSrc?: string | null;
  projectId?: string | null;
  sessionId?: string | null;
}
