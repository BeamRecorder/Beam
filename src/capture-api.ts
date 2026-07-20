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

export interface CursorMoveEvent {
  event: 'move'
  sessionNs: number
  pixelX: number
  pixelY: number
  normalizedX: number
  normalizedY: number
  visible: boolean
}

export interface CursorShapeEvent {
  event: 'shape'
  sessionNs: number
  shapeId: string
  hotspot: { x: number; y: number }
}

export interface CursorButtonEvent {
  event: 'button'
  sessionNs: number
  button: number
  pressed: boolean
}

export interface CursorVisibilityEvent {
  event: 'visibility'
  sessionNs: number
  visible: boolean
}

export type CursorEvent = CursorMoveEvent | CursorShapeEvent | CursorButtonEvent | CursorVisibilityEvent

export interface CursorShapeAsset {
  src: string
  hotspot: { x: number; y: number }
}

export interface SessionTrackAsset {
  path: string
  startNs: number
  endNs?: number | null
  complete: boolean
  src: string | null
  exists: boolean
}

export interface SessionTrackData {
  trackId: string
  kind: 'screen' | 'system-audio' | 'microphone' | 'camera' | 'cursor'
  sourceId: string | null
  format: Record<string, unknown>
  segments: SessionTrackAsset[]
  assets: SessionTrackAsset[]
  metrics: Record<string, number>
  status: string
  terminationReason: string | null
}

export interface SessionManifestData {
  schemaVersion: number
  projectId: string
  sessionId: string
  createdAtUtc: string
  sessionStartMonotonicNs: number
  durationNs: number
  platform: Record<string, string>
  selectedSources: Record<string, string | null>
  tracks: SessionTrackData[]
  permissions: Record<string, unknown>
  warnings: string[]
  completed: boolean
}

export interface ProjectEditorData {
  sessionId: string
  manifest: SessionManifestData
  videoSrc: string | null
  tracks: SessionTrackData[]
  cursor: {
    available: boolean
    events: CursorEvent[]
    shapes: Record<string, CursorShapeAsset>
    missing: string[]
  }
}

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
  getProjectEditorData(projectId: string): Promise<ProjectEditorData | null>
  createProject(options?: CreateProjectOptions): Promise<CaptureProject>
  renameProject(projectId: string, name: string): Promise<CaptureProject>
  deleteProject(projectId: string): Promise<void>
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
  },
  getProjectEditorData: async () => {
    throw new Error('Les données d’édition sont disponibles uniquement dans Electron.')
  },
  createProject: async () => {
    throw new Error('La gestion des projets est disponible uniquement dans Electron.')
  },
  renameProject: async () => {
    throw new Error('La gestion des projets est disponible uniquement dans Electron.')
  },
  deleteProject: async () => {
    throw new Error('La gestion des projets est disponible uniquement dans Electron.')
  },
}

if (typeof window !== 'undefined' && !window.capture) {
  window.capture = mockCapture
}

export const capture: DesktopCaptureApi = window.capture
