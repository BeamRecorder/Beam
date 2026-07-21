export interface CreateProjectOptions {
  name?: string
}

export interface StartRecordingOptions {
  projectId?: string
  screenKind?: 'display' | 'window'
  screenId?: string
  microphoneId?: string | null
  cameraId?: string | null
  systemAudio?: boolean
  cursor?: boolean
  outputRoot?: string
  targetFps?: number
  videoBitrateBps?: number
  queueCapacity?: number
  minimumFreeBytes?: number
  failurePolicy?: 'fail-fast' | 'continue-without-optional-tracks'
}

export interface RecordingSettings {
  outputRoot: string
  videoBitrateBps: number
  targetFps: number
  keyframeIntervalSeconds: 1 | 2
  queueCapacity: number
  minimumFreeBytes: number
}

export interface CaptureConfig {
  projectId: string
  screen: null | { mode: 'source'; sourceId: string } | {
    mode: 'portal'
    kind: 'monitor' | 'window' | 'monitor-or-window'
    restoreToken: string | null
  }
  systemAudio: null | { mode: 'default-mix' | 'screen-capture-mix' } | {
    mode: 'output-device'
    sourceId: string
  }
  microphone: null | {
    sourceId: string
    preferredSampleRate: number | null
    preferredChannels: number | null
  }
  cursor: { mode: 'disabled' | 'embedded' } | {
    mode: 'separate'
    captureClicks: boolean
    captureShape: boolean
  }
  recording: RecordingSettings
  failurePolicy: 'fail-fast' | 'continue-without-optional-tracks'
}
