import type { ScreenRegion, ScreenRegionOverlayOptions } from '../../../api/types/screen-region';

export type RecordingPhase = 'idle' | 'countdown' | 'recording' | 'paused' | 'finalizing';
export type RecordingBarVisibility = 'always' | 'auto-fade' | 'hover-only';

export interface RecordingConfiguration {
  screenKind: 'display' | 'window';
  screenId?: string;
  cameraId: string;
  microphoneId: string;
  systemAudio: boolean;
  targetFps: number;
  countdownSeconds: number;
  recordingBarVisibility: RecordingBarVisibility;
  recordInteractions?: boolean;
  region?: ScreenRegion | null;
  regionOverlay?: ScreenRegionOverlayOptions | null;
}

export interface RecordingSessionResult {
  videoSrc?: string | null;
  projectId?: string | null;
  sessionId?: string | null;
}
