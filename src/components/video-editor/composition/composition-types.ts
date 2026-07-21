export type CompositionMediaKind = 'video' | 'image' | 'audio'
export type CompositionLayerKind = CompositionMediaKind | 'caption'

export interface NormalizedTransform { x: number; y: number; width: number; height: number }
export interface CaptionWord { text: string; startMs: number; endMs: number }
export interface CaptionSentence { id: string; text: string; startMs: number; endMs: number; words: CaptionWord[] }
export interface CaptionStyle { color: string; fontSize: number; shadowColor: string; shadowBlur: number; placement: 'top' | 'center' | 'bottom' }
export interface CaptionData { sentences: CaptionSentence[]; style: CaptionStyle }
export interface WebcamAppearance { shadowSize: 'none' | 'sm' | 'md' | 'lg'; cornerRadius: 'none' | 'sm' | 'md' | 'lg' | 'full' }
export interface CompositionMedia { id: string; kind: CompositionMediaKind; name: string; fileName: string | null; durationMs: number; width: number | null; height: number | null; src: string; origin?: 'project' | 'session'; sessionId?: string; sessionPath?: string }
export interface CompositionLayerBase { id: string; kind: CompositionLayerKind; name: string; startMs: number; endMs: number; enabled: boolean; order: number }
export interface MediaCompositionLayer extends CompositionLayerBase { kind: CompositionMediaKind; assetId: string; transform?: NormalizedTransform; sourceOffsetMs?: number; reactToZoom?: boolean; webcamAppearance?: WebcamAppearance }
export interface CaptionCompositionLayer extends CompositionLayerBase { kind: 'caption'; caption: CaptionData }
export type CompositionLayer = MediaCompositionLayer | CaptionCompositionLayer
export interface ProjectComposition { media: CompositionMedia[]; layers: CompositionLayer[] }

export const emptyComposition = (): ProjectComposition => ({ media: [], layers: [] })
export const activeLayersAt = (composition: ProjectComposition, timeMs: number) => composition.layers.filter((layer) => layer.enabled && layer.startMs <= timeMs && timeMs <= layer.endMs).sort((a, b) => a.order - b.order)
