import type {
  CaptureConfig,
  CreateProjectOptions,
  StartRecordingOptions,
} from './capture-config'
import type {
  CaptureProject,
  CaptureSession,
  ProjectEditorData,
  ProjectZoomState,
} from './capture-session'

export type * from './capture-config'
export type * from './capture-session'

export interface CaptureApi {
  discover(): Promise<CaptureCatalog>
  capabilities(): Promise<Record<string, boolean>>
  permissions(): Promise<Record<string, unknown>>
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
  setWindowMode(mode: 'hud' | 'editor'): void
  present(): void
  maximize(): void
  unmaximize(): void
  toggleMaximize(): void
  setPosition(x: number, y: number): void
  setSize(width: number, height: number): void
  setSizeSmooth(width: number, height: number): void
  setInteractive(overInteractive: boolean): void
  dragStart(): void
  drag(): void
  getSources(types?: string[]): Promise<CapturePreview[]>
  listProjects(): Promise<CaptureProject[]>
  getProjectEditorData(projectId: string): Promise<ProjectEditorData | null>
  saveProjectZoomState(projectId: string, zoom: ProjectZoomState): Promise<ProjectZoomState>
  createProject(options?: CreateProjectOptions): Promise<CaptureProject>
  renameProject(projectId: string, name: string): Promise<CaptureProject>
  deleteProject(projectId: string): Promise<void>
  beginExport(options: { projectName: string; format: 'webm' | 'mp4' }): Promise<{ canceled: true } | { canceled: false; jobId: string }>
  writeExportChunk(payload: { jobId: string; sequence: number; data: Uint8Array; position: number }): Promise<void>
  finalizeExport(jobId: string): Promise<{ path: string }>
  abortExport(jobId: string): Promise<void>
  beginCameraSegment(payload: CameraSegmentStart): Promise<{ jobId: string }>
  writeCameraSegment(payload: MediaSegmentChunk): Promise<void>
  finalizeCameraSegment(payload: CameraSegmentFinish): Promise<void>
  failCamera(payload: { sessionId: string; reason: string }): Promise<void>
  beginMicrophoneSegment(payload: MicrophoneSegmentStart): Promise<{ jobId: string }>
  writeMicrophoneSegment(payload: MediaSegmentChunk): Promise<void>
  finalizeMicrophoneSegment(payload: MicrophoneSegmentFinish): Promise<void>
  failMicrophone(payload: MicrophoneFailure): Promise<void>
  beginSystemAudioSegment(payload: SystemAudioSegmentStart): Promise<{ jobId: string }>
  writeSystemAudioSegment(payload: MediaSegmentChunk): Promise<void>
  finalizeSystemAudioSegment(payload: SystemAudioSegmentFinish): Promise<void>
  failSystemAudio(payload: SystemAudioFailure): Promise<void>
}

export interface CameraSegmentStart {
  sessionId: string
  sourceId: string
  format: { codec: 'vp8'; width: number; height: number; nominalFps: number }
  startNs: number
}

export interface MediaSegmentChunk {
  jobId: string
  sequence: number
  data: Uint8Array
}

export interface CameraSegmentFinish {
  jobId: string
  endNs: number
  metrics: Record<string, number>
}

export interface MicrophoneSegmentStart {
  sessionId: string
  sourceId: string
  format: { codec: 'opus'; sampleRate: number; channels: number }
  startNs: number
}

export interface MicrophoneSegmentFinish {
  jobId: string
  endNs: number
  metrics: Record<string, number>
}

export interface MicrophoneFailure {
  sessionId: string
  sourceId: string
  reason: string
  format?: { codec: 'opus'; sampleRate: number; channels: number }
}

export interface SystemAudioSegmentStart {
  sessionId: string
  sourceId: string
  format: { codec: 'opus'; sampleRate: number; channels: number }
  startNs: number
}

export interface SystemAudioSegmentFinish {
  jobId: string
  endNs: number
  metrics: Record<string, number>
}

export interface SystemAudioFailure {
  sessionId: string
  sourceId: string
  reason: string
  format?: { codec: 'opus'; sampleRate: number; channels: number }
}

export interface CapturePreview {
  id: string
  name: string
  thumbnail: string
  appIcon: string | null
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
