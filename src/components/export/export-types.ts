import type { ProjectEditorData } from '../../api/types/capture-api'
import type { ZoomElement } from '../video-editor/zoom/zoom-types'
import type { ProjectComposition } from '../video-editor/composition/composition-types'
import type { CursorType } from '../video-editor/composables/useCursorReplacer'
import type { OutputCanvasSettings } from '../video-editor/canvas/output-canvas'

export type ExportFormat = 'webm' | 'mp4'
export type ExportPreset = 'low' | 'medium' | 'high'
export type ExportStage = 'preparing' | 'rendering' | 'encoding' | 'finalizing'

export interface ExportProgress { stage: ExportStage; completed: number; total: number }
export interface ExportResult { path: string; format: ExportFormat }
export interface VideoLayer { src: string; width: number; height: number; fps: number; enabled: boolean }
export interface AudioLayer { id: string; src: string; startSeconds: number; enabled: boolean }
export interface RenderLayer { kind: 'background' | 'video' | 'cursor'; enabled: boolean }
export interface CursorRenderSettings {
  selectedCursor: CursorType
  size: number
  color: string
  shadow: { enabled: boolean; blur: number; color: string }
  ripple: { enabled: boolean; color: string; size: number }
}
export interface CompositionSnapshot {
  duration: number
  video: VideoLayer
  canvas: OutputCanvasSettings
  background: { kind: 'color' | 'image' | 'video'; src?: string } | null
  zooms: ZoomElement[]
  cursor: ProjectEditorData['cursor']
  cursorSettings: CursorRenderSettings
  audio: AudioLayer[]
  composition: ProjectComposition
  layers: RenderLayer[]
}
export interface ExportRequest {
  projectName: string
  format: ExportFormat
  preset: ExportPreset
  snapshot: CompositionSnapshot
}
