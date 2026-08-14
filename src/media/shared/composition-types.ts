export const COMPOSITION_SCHEMA_VERSION = 1 as const;
export const SCREEN_CLIP_ID = 'screen';

export type MediaKind = 'video' | 'image' | 'audio';
export type ClipKind = 'screen' | 'video' | 'image' | 'webcam' | 'audio' | 'caption';
export type AudioRole = 'system' | 'microphone' | 'imported';

export interface NormalizedTransform {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A rectangle in the source media, expressed as fractions of its dimensions. */
export interface NormalizedCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptionWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface CaptionSentence {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  words: CaptionWord[];
}

export interface CaptionStyle {
  color: string;
  fontSize: number;
  shadowColor: string;
  shadowBlur: number;
  shadowDirection?: 'all' | 'bottom' | 'bottom-right' | 'top-left';
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  backdropBlur?: number;
  boxColor?: string;
  boxPadding?: number;
  boxRadius?: number;
  placement: 'top' | 'center' | 'bottom';
  customText?: string;
}

export interface CaptionData {
  sentences: CaptionSentence[];
  style: CaptionStyle;
}

export type ClipShadowSize = 'none' | 'sm' | 'md' | 'lg' | 'custom';
export type ClipShadowMode = 'solid' | 'adaptive';

export interface WebcamAppearance {
  shadowSize: ClipShadowSize;
  shadowBlur?: number;
  shadowMode?: ClipShadowMode;
  cornerRadius: 'none' | 'sm' | 'md' | 'lg' | 'full' | number;
}

export interface ClipAppearance extends WebcamAppearance {
  shadowColor: string;
  shadowDirection: 'all' | 'bottom' | 'bottom-right' | 'top-left';
  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number;
  frame: ClipFrame;
  frameTitle: string;
  frameColor: string;
  frameShowMenu: boolean;
  frameShowScrollbars: boolean;
  frameChromeScale: number;
}

export type ClipFrame = 'none' | 'safari' | 'windows-95';

export interface MediaAsset {
  id: string;
  kind: MediaKind;
  name: string;
  fileName: string | null;
  durationMs: number;
  width: number | null;
  height: number | null;
  src: string;
  origin: 'project' | 'session';
  sessionId?: string;
  sessionPath?: string;
}

export interface ClipBase {
  id: string;
  kind: ClipKind;
  name: string;
  timelineStartMs: number;
  timelineDurationMs: number;
  sourceInMs: number;
  sourceDurationMs: number;
  playbackRate: number;
  enabled: boolean;
  /** Lower values are nearer the foreground. */
  order: number;
  /** Clips sharing a group are edited by the same engine operation until detached. */
  groupId?: string;
}

export interface VisualClip extends ClipBase {
  kind: 'screen' | 'video' | 'image' | 'webcam';
  assetId: string;
  transform: NormalizedTransform;
  crop?: NormalizedCrop;
  appearance?: ClipAppearance;
  isMirrored?: boolean;
  isMirroredY?: boolean;
}

export interface AudioClip extends ClipBase {
  kind: 'audio';
  assetId: string;
  role: AudioRole;
  volume: number;
}

export interface CaptionClip extends ClipBase {
  kind: 'caption';
  caption: CaptionData;
  transform?: NormalizedTransform;
  isAiGenerated?: boolean;
}

export type Clip = VisualClip | AudioClip | CaptionClip;

export interface ClipComposition {
  schemaVersion: typeof COMPOSITION_SCHEMA_VERSION;
  assets: MediaAsset[];
  clips: Clip[];
}

export const emptyComposition = (): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets: [],
  clips: [],
});

export const clipEndMs = (clip: Pick<ClipBase, 'timelineStartMs' | 'timelineDurationMs'>) =>
  clip.timelineStartMs + clip.timelineDurationMs;

export const isVisualClip = (clip: Clip): clip is VisualClip =>
  clip.kind === 'screen' || clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'webcam';

export const isAudioClip = (clip: Clip): clip is AudioClip => clip.kind === 'audio';
export const isCaptionClip = (clip: Clip): clip is CaptionClip => clip.kind === 'caption';

export const getCaptionTransform = (clip: CaptionClip): NormalizedTransform => {
  if (clip.transform) return clip.transform;
  const placement = clip.caption.style.placement;
  const y = placement === 'top' ? 0.06 : placement === 'center' ? 0.43 : 0.8;
  return { x: 0.1, y, width: 0.8, height: 0.14 };
};
