export const MIN_PLAYBACK_RATE = 0.25
export const MAX_PLAYBACK_RATE = 4
export const COMPOSITION_SCHEMA_VERSION = 2

export type ClipKind = 'video' | 'audio' | 'image' | 'webcam' | 'annotation'
export interface ClipTransform { x: number; y: number; width: number; height: number }
export interface Clip {
  id: string
  kind: ClipKind
  mediaId: string | null
  annotationId: string | null
  timelineStartMs: number
  timelineDurationMs: number
  sourceInMs: number
  sourceDurationMs: number
  playbackRate: number
  enabled: boolean
  order: number
  transform: ClipTransform | null
}
export interface ClipGroup { id: string; clipIds: string[] }
export interface ClipComposition { schemaVersion: 2; clips: Clip[]; groups: ClipGroup[] }
export interface LegacyComposition {
  media: Array<{ id: string; kind: 'video' | 'image' | 'audio'; durationMs: number }>
  layers: Array<{ id: string; kind: 'video' | 'image' | 'audio' | 'caption'; assetId?: string; startMs: number; endMs: number; enabled: boolean; order: number; transform?: ClipTransform }>
}
export type IdFactory = () => string
