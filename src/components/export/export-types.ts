import type { ProjectEditorData } from '../../api/types/capture-api'
import type { ZoomElement } from '../video-editor/zoom/zoom-types'
import type { ClipComposition } from '../video-editor/composition/composition-types'
import type { CursorType } from '../video-editor/properties/cursor/useCursorReplacer'
import type { OutputCanvasSettings } from '../video-editor/canvas/output-canvas'
import type { ShadowDirection } from '../video-editor/properties/cursor/shadow-types'
import type { CursorClickEffects, CursorMotionSettings } from '../../api/types/cursor-settings'

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
export interface ExportResult {
  path: string
  format: ExportFormat
}
export interface ExportRenderSettings {
  fps: number
  sourceWidth: number
  sourceHeight: number
}
export interface CursorRenderSettings {
  selectedCursor: CursorType
  size: number
  color: string
  shadow: { enabled: boolean; blur: number; color: string; direction: ShadowDirection }
  clickEffects: CursorClickEffects
  motion: CursorMotionSettings
}
export interface CompositionSnapshot {
  duration: number
  render: ExportRenderSettings
  canvas: OutputCanvasSettings
  background:
    | { kind: 'color'; color: string }
    | { kind: 'gradient'; gradient: import('../video-editor/composables/backgroundCatalog').GradientBackground }
    | { kind: 'image' | 'video'; src: string }
    | null
  blurPercent: number
  zooms: ZoomElement[]
  cursor: ProjectEditorData['cursor']
  cursorSettings: CursorRenderSettings
  composition: ClipComposition
}
export interface ExportRequest {
  projectName: string
  format: ExportFormat
  preset: ExportPreset
  snapshot: CompositionSnapshot
}
