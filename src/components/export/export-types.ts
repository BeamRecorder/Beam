import type { ProjectEditorData } from '../../api/types/capture-api'
import type { ZoomElement } from '../video-editor/zoom/zoom-types'

export type ExportFormat = 'webm' | 'mp4'
export type ExportPreset = 'low' | 'medium' | 'high'
export type ExportStage = 'preparing' | 'rendering' | 'encoding' | 'finalizing'

export interface ExportProgress { stage: ExportStage; completed: number; total: number }
export interface ExportResult { path: string; format: ExportFormat }
export interface VideoLayer { src: string; width: number; height: number; fps: number; enabled: boolean }
export interface AudioLayer { id: string; src: string; startSeconds: number; enabled: boolean }
export interface RenderLayer { kind: 'background' | 'video' | 'cursor'; enabled: boolean }
export interface CompositionSnapshot {
  duration: number
  video: VideoLayer
  background: { kind: 'color' | 'image' | 'gif' | 'video'; src?: string } | null
  zooms: ZoomElement[]
  cursor: ProjectEditorData['cursor']
  audio: AudioLayer[]
  layers: RenderLayer[]
}
export interface ExportRequest {
  projectName: string
  format: ExportFormat
  preset: ExportPreset
  snapshot: CompositionSnapshot
}
