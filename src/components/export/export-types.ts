import type { ProjectEditorData } from '../../api/types/capture-api'
import type { ZoomElement } from '../video-editor/zoom/zoom-types'
import type { ClipComposition } from '../video-editor/composition/composition-types'
import type { CursorType } from '../video-editor/properties/cursor/useCursorReplacer'
import type { OutputCanvasSettings } from '../video-editor/canvas/output-canvas'
import type { ShadowDirection } from '../video-editor/properties/shadow-types'

export type ExportFormat = 'webm' | 'mp4'
export type ExportPreset = 'low' | 'medium' | 'high'
export type ExportStage = 'preparing' | 'audio_mixing' | 'loading_assets' | 'encoding' | 'finalizing'

export interface ExportProgress {
  stage: ExportStage
  stageLabel?: string
  completed: number
  total: number
  currentTimeMs?: number
  totalTimeMs?: number
}
export interface ExportResult { path: string; format: ExportFormat }
export interface VideoLayer { clipId: string; assetId: string; src: string; width: number; height: number; fps: number; enabled: boolean }
export interface RenderLayer { kind: 'background' | 'video' | 'cursor'; enabled: boolean }
export interface CursorRenderSettings {
  selectedCursor: CursorType
  size: number
  color: string
  shadow: { enabled: boolean; blur: number; color: string; direction: ShadowDirection }
  clickSpring: { enabled: boolean }
  ripple: { enabled: boolean; color: string; size: number }
}
export interface CompositionSnapshot {
  duration: number
  video: VideoLayer
  canvas: OutputCanvasSettings
  background: { kind: 'color'; color: string } | { kind: 'gradient'; gradient: import('../video-editor/composables/backgroundCatalog').GradientBackground } | { kind: 'image' | 'video'; src: string } | null
  blurPercent: number
  zooms: ZoomElement[]
  cursor: ProjectEditorData['cursor']
  cursorSettings: CursorRenderSettings
  composition: ClipComposition
  layers: RenderLayer[]
}
export interface ExportRequest {
  projectName: string
  format: ExportFormat
  preset: ExportPreset
  snapshot: CompositionSnapshot
}
