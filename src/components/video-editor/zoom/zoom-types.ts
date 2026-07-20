export interface ZoomFocus {
  cx: number
  cy: number
}

export interface ZoomFocusKeyframe extends ZoomFocus {
  timeMs: number
}

export type ZoomSource = 'automatic' | 'manual'

export interface ZoomElement {
  id: string
  sessionId: string
  startMs: number
  endMs: number
  focus: ZoomFocus
  focusKeyframes: ZoomFocusKeyframe[]
  scale: number
  speed: number
  source: ZoomSource
}

export interface ZoomGenerationRecord {
  sessionId: string
  algorithmVersion: number
  generatedAt: string
}

export interface ProjectZoomState {
  elements: ZoomElement[]
  generatedSessions: ZoomGenerationRecord[]
}

export const EMPTY_PROJECT_ZOOM_STATE: ProjectZoomState = {
  elements: [],
  generatedSessions: [],
}

export const DEFAULT_ZOOM_SCALE = 1.75
export const DEFAULT_ZOOM_SPEED = 1
