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
