export type RecordingPhase = 'idle' | 'countdown' | 'recording' | 'paused' | 'finalizing'

export interface RecordingConfiguration {
  screenKind: 'display' | 'window'
  screenId?: string
  cameraId: string
  microphoneId: string
  systemAudio: boolean
  targetFps: number
  countdownSeconds: number
  recordingBarVisibility: 'always' | 'auto-fade'
}

export interface RecordingSessionResult {
  videoSrc?: string | null
  sessionId?: string | null
}
