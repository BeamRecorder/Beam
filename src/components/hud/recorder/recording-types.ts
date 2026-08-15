import type { ScreenRegion, ScreenRegionOverlayOptions } from '../../../api/types/screen-region';

export type RecordingPhase = 'idle' | 'countdown' | 'starting' | 'recording' | 'paused' | 'finalizing';
export type RecordingBarVisibility = 'always' | 'auto-fade' | 'hover-only';
export type StartupSidecarState = 'disabled' | 'prepared' | 'started' | 'failed';
export type RecordingStartStage = 'prepare-sources' | 'prepare-native' | 'start-native' | 'start-sidecars' | 'cleanup';

export const isRecordingActivePhase = (phase: RecordingPhase): boolean =>
  phase === 'countdown' || phase === 'starting' || phase === 'recording' || phase === 'paused';

export interface RecordingStartFailure {
  stage: RecordingStartStage;
  message: string;
  nativePrepared: boolean;
  nativeStarted: boolean;
  camera: StartupSidecarState;
  microphone: StartupSidecarState;
  systemAudio: StartupSidecarState;
  cleanupErrors?: string[];
}

export const formatRecordingStartFailure = (failure: RecordingStartFailure): string => {
  const lines = [
    'Recording failed during native startup.',
    `Stage: ${failure.stage}`,
    `Native prepared: ${failure.nativePrepared ? 'yes' : 'no'}`,
    `Native started: ${failure.nativeStarted ? 'yes' : 'no'}`,
    `Camera: ${failure.camera}`,
    `Microphone: ${failure.microphone}`,
    `System audio: ${failure.systemAudio}`,
    `Error: ${failure.message}`,
  ];
  if (failure.cleanupErrors && failure.cleanupErrors.length > 0) {
    lines.push(`Cleanup: ${failure.cleanupErrors.join(' | ')}`);
  }
  return lines.join('\n');
};

export const formatRecordingTime = (tenths: number): string => {
  const seconds = Math.floor(tenths / 10);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${tenths % 10}`;
};

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
