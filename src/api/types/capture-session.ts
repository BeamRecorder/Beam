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
  thumbnailSrc?: string | null
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
  /** Present only in schema-v1 bitmap sessions. */
  shapeId?: string
  cursorId?: string
  cursorKind?: CursorKind
  nativeCursorId?: string
  hotspot: { x: number; y: number }
}

export type CursorKind =
  | 'default' | 'textcursor' | 'handpointing' | 'busy' | 'help' | 'cross'
  | 'move' | 'notallowed' | 'resizenorthsouth' | 'resizewesteast'
  | 'resizenortheastsouthwest' | 'resizenorthwestsoutheast' | 'custom'

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

export type CursorInteractionType = 'move' | 'click' | 'double-click' | 'right-click' | 'middle-click' | 'mouseup'

export interface CursorTelemetryPoint {
  timeMs: number
  cx: number
  cy: number
  interactionType?: CursorInteractionType
  cursorType?: string
}

export interface CursorTelemetrySidecar {
  version: 2
  samples: CursorTelemetryPoint[]
}

export interface CursorShapeAsset {
  src: string
  hotspot: { x: number; y: number }
}

export interface CursorShapeCatalogEntry {
  cursorKind: CursorKind
  nativeCursorId: string
  hotspot: { x: number; y: number }
}

export interface ZoomFocus {
  cx: number
  cy: number
}

export interface ZoomElement {
  id: string
  sessionId: string
  startMs: number
  endMs: number
  focus: ZoomFocus
  depth: 1 | 2 | 3 | 4 | 5 | 6
  mode: 'auto' | 'manual'
}

export interface ProjectZoomState {
  elements: ZoomElement[]
  generatedSessions: Array<{
    sessionId: string
    algorithmVersion: number
    generatedAt: string
  }>
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
    telemetry: CursorTelemetryPoint[]
    shapes: Record<string, CursorShapeAsset>
    catalog: Record<string, CursorShapeCatalogEntry>
    missing: string[]
  }
  zoom: ProjectZoomState
}
