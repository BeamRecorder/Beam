export interface ZoomFocus {
  cx: number
  cy: number
}

export type ZoomDepth = 1 | 2 | 3 | 4 | 5 | 6
export type ZoomMode = 'auto' | 'manual'

export const ZOOM_DEPTH_SCALES: Record<ZoomDepth, number> = {
  1: 1.25,
  2: 1.5,
  3: 1.8,
  4: 2.2,
  5: 3.5,
  6: 5,
}

export interface ZoomElement {
  id: string
  sessionId: string
  startMs: number
  endMs: number
  focus: ZoomFocus
  depth: ZoomDepth
  mode: ZoomMode
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

export const DEFAULT_ZOOM_DEPTH: ZoomDepth = 2
