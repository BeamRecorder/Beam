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
