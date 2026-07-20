export type CaptureState =
  | 'idle'
  | 'discovering'
  | 'preparing'
  | 'armed'
  | 'recording'
  | 'degraded'
  | 'paused'
  | 'stopping'
  | 'finalizing'
  | 'completed'
  | 'recoverable'
  | 'failed'

export interface CaptureSession {
  state: CaptureState
  sessionId?: string | null
  manifestPath?: string | null
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
  camera: null | {
    sourceId: string
    preferredWidth: number | null
    preferredHeight: number | null
    preferredFps: number | null
    preferredPixelFormat: 'mjpeg' | 'yuyv' | 'nv12' | 'bgra' | 'rgba' | null
  }
  cursor: { mode: 'disabled' | 'embedded' } | {
    mode: 'separate'
    captureClicks: boolean
    captureShape: boolean
  }
  recording: RecordingSettings
  failurePolicy: 'fail-fast' | 'continue-without-optional-tracks'
}

export interface CaptureApi {
  discover(): Promise<unknown>
  capabilities(): Promise<unknown>
  permissions(): Promise<unknown>
  formats(sourceId: string): Promise<unknown>
  prepare(config: CaptureConfig): Promise<CaptureSession>
  /** Avec une config, prépare et démarre en un seul appel. Sans config, démarre la session préparée. */
  start(config?: CaptureConfig): Promise<CaptureSession>
  pause(): Promise<CaptureSession>
  resume(): Promise<CaptureSession>
  stop(): Promise<CaptureSession>
  status(): Promise<CaptureSession>
}

declare global {
  interface Window {
    capture: CaptureApi
  }
}

export const capture: CaptureApi = window.capture
