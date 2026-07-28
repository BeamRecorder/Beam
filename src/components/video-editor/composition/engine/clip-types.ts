/** The persisted editor document. Nothing outside this model is a timeline. */
export const COMPOSITION_SCHEMA_VERSION = 3
export const MIN_PLAYBACK_RATE = .25
export const MAX_PLAYBACK_RATE = 4

export type AssetKind = 'video' | 'audio' | 'image'
export type ClipKind = 'screen' | 'webcam' | 'system-audio' | 'microphone' | 'video' | 'audio' | 'image' | 'caption'
export interface ClipTransform { x: number; y: number; width: number; height: number }
export interface ClipCrop { x: number; y: number; width: number; height: number }
export interface ClipAppearance { cornerRadius?: 'none' | 'sm' | 'md' | 'lg' | 'full' | number; shadowSize?: 'none' | 'sm' | 'md' | 'lg'; shadowColor?: string; shadowDirection?: 'all' | 'bottom' | 'bottom-right' | 'top-left'; borderEnabled?: boolean; borderColor?: string; borderWidth?: number; frame?: 'none' | 'safari' | 'windows-95'; frameTitle?: string; frameColor?: string; frameShowMenu?: boolean; frameShowScrollbars?: boolean }
export interface CaptionContent { text: string; style: Record<string, unknown> }
export interface CompositionAsset { id: string; kind: AssetKind; name: string; durationMs: number; width: number | null; height: number | null; src: string; origin: 'project' | 'session'; fileName?: string | null; sessionId?: string; sessionPath?: string }
export interface Clip { id: string; kind: ClipKind; assetId: string | null; caption: CaptionContent | null; timelineStartMs: number; timelineDurationMs: number; sourceInMs: number; sourceDurationMs: number; playbackRate: number; enabled: boolean; trackOrder: number; appearance?: ClipAppearance; crop?: ClipCrop; transform?: ClipTransform; isMirrored?: boolean; volume?: number }
export interface ClipGroup { id: string; clipIds: string[] }
export interface ClipComposition { schemaVersion: typeof COMPOSITION_SCHEMA_VERSION; assets: CompositionAsset[]; clips: Clip[]; groups: ClipGroup[] }
export type IdFactory = () => string
export type TrimEdge = 'start' | 'end'
