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
  videoSrc?: string | null
}

export interface CaptureProject {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  sessionCount: number
  previewSrc: string | null
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
  cameraWidth?: number
  cameraHeight?: number
  cameraFps?: number
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
  /** Découvre les sources, choisit l'écran par défaut et applique les réglages recommandés. */
  startRecording(options?: StartRecordingOptions): Promise<CaptureSession>
  /** Avec une config, prépare et démarre en un seul appel. Sans config, démarre la session préparée. */
  start(config?: CaptureConfig): Promise<CaptureSession>
  pause(): Promise<CaptureSession>
  resume(): Promise<CaptureSession>
  stop(): Promise<CaptureSession>
  status(): Promise<CaptureSession>
}

export interface DesktopCaptureApi extends CaptureApi {
  close(): void
  minimize(): void
  maximize(): void
  unmaximize(): void
  setPosition(x: number, y: number): void
  setSize(width: number, height: number): void
  setSizeSmooth(width: number, height: number): void
  dragStart(): void
  drag(): void
  getSources(types?: string[]): Promise<any[]>
  listProjects(): Promise<CaptureProject[]>
}

export interface CaptureSource {
  id: string
  kind: 'display' | 'window' | 'application' | 'system-audio' | 'microphone' | 'camera'
  label: string
  isDefault: boolean
}

export interface CaptureCatalog {
  sources: CaptureSource[]
  capabilities: Record<string, boolean>
}

declare global {
  interface Window {
    capture: DesktopCaptureApi
  }
}

const mockCapture: DesktopCaptureApi = {
  discover: async () => ({
    sources: [
      { id: 'cam1', kind: 'camera', label: 'FaceTime HD Camera (Mock)', isDefault: true },
      { id: 'mic1', kind: 'microphone', label: 'MacBook Pro Microphone (Mock)', isDefault: true }
    ],
    capabilities: {}
  }),
  capabilities: async () => ({}),
  permissions: async () => ({}),
  formats: async () => ({}),
  prepare: async () => ({ state: 'armed' }),
  startRecording: async () => ({ state: 'recording', sessionId: 'mock-session-id' }),
  start: async () => ({ state: 'recording' }),
  pause: async () => ({ state: 'paused' }),
  resume: async () => ({ state: 'recording' }),
  stop: async () => ({ state: 'completed', sessionId: 'mock-session-id', videoSrc: '/wallpapers/wispysky.mp4' }),
  status: async () => ({ state: 'idle' }),
  close: () => console.log('Mock close'),
  minimize: () => console.log('Mock minimize'),
  maximize: () => console.log('Mock maximize'),
  unmaximize: () => console.log('Mock unmaximize'),
  setPosition: () => {},
  setSize: () => {},
  setSizeSmooth: () => {},
  dragStart: () => {},
  drag: () => {},
  getSources: async () => [
    { id: 'screen:1', name: 'Desktop 1 (Mock)', thumbnail: '/wallpapers/sonoma-light.jpg' },
    { id: 'window:1', name: 'VS Code (Mock)', thumbnail: '/wallpapers/ventura.jpg' }
  ],
  listProjects: async () => {
    throw new Error('La liste des projets est disponible uniquement dans Electron.')
  }
}

if (typeof window !== 'undefined' && !window.capture) {
  window.capture = mockCapture
}

export const capture: DesktopCaptureApi = window.capture
