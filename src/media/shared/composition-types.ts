import type { CameraFramingPreset, CameraLayoutPreset } from './camera-layout-types';

export const COMPOSITION_SCHEMA_VERSION = 11 as const;
export const SCREEN_CLIP_ID = 'screen';

export type MediaKind = 'video' | 'image' | 'audio';
export type BlurEffectShape = 'rectangle' | 'square' | 'circle';
export type BlurEffectMode = 'blur' | 'frosted' | 'pixelated' | 'opaque';
export type ClipKind = 'screen' | 'video' | 'image' | 'webcam' | 'blur' | 'audio' | 'caption';
export type AudioRole = 'system' | 'microphone' | 'imported';

export type TransitionPreset =
  | { kind: 'fade' }
  | { kind: 'slide'; direction: 'left' | 'right' | 'up' | 'down' }
  | { kind: 'zoom'; direction: 'in' | 'out' }
  | { kind: 'blur' };

export interface ClipTransition {
  preset: TransitionPreset;
  durationMs: number;
}

export interface ClipTransitions {
  entry: ClipTransition | null;
  exit: ClipTransition | null;
}

/** Global visual transitions applied to the fully composited output frame. */
export type CanvasTransitions = ClipTransitions;

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
  fontFamily: string;
  fontAssetId?: string;
  fontWeight: 400 | 800;
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'line-through';
  textAlign: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  color: string;
  fontSize: number;
  wrap: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowDirection?: 'all' | 'bottom' | 'bottom-right' | 'top-left';
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  backdropBlur: number;
  outlineColor: string;
  outlineWidth: number;
  extrusionDepth: number;
  placement: 'top' | 'center' | 'bottom';
  customText?: string;
}

export interface TextCaptionData {
  type: 'text';
  sentences: CaptionSentence[];
  style: CaptionStyle;
}

export type KeyboardCaptionModifier = 'control' | 'shift' | 'alt' | 'meta';
export type KeyboardCaptionPlatform = 'windows' | 'macos' | 'linux';

export interface KeyboardCaptionStep {
  offsetMs: number;
  modifiers: KeyboardCaptionModifier[];
  key: string;
}

export interface KeyboardCaptionData {
  type: 'keyboard';
  steps: KeyboardCaptionStep[];
  followCursor: boolean;
  recordedPlatform: KeyboardCaptionPlatform;
  sourceSessionId: string;
  style: CaptionStyle;
}

export type CaptionData = TextCaptionData | KeyboardCaptionData;

export type ClipShadowSize = 'none' | 'sm' | 'md' | 'lg' | 'custom';
export type ClipShadowMode = 'solid' | 'adaptive';

export interface WebcamAppearance {
  shadowSize: ClipShadowSize;
  shadowBlur: number;
  shadowMode: ClipShadowMode;
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
  /** Required in persisted v8 compositions; optional while constructing legacy/test input before normalization. */
  transitions?: ClipTransitions;
  enabled: boolean;
  /** Lower values are nearer the foreground. */
  order: number;
  /** Clips sharing a group are edited by the same engine operation until detached. */
  groupId?: string;
  /** Persisted timeline lane for compositing clips; absent on non-visual clips and pre-v4 data. */
  trackId?: string;
}

export interface VisualClip extends ClipBase {
  kind: 'screen' | 'video' | 'image' | 'webcam';
  assetId: string;
  transform: NormalizedTransform;
  crop?: NormalizedCrop;
  appearance: ClipAppearance;
  isMirrored: boolean;
  isMirroredY: boolean;
  /** Holds one decoded video frame for the whole clip duration when present. */
  freezeFrameSourceMs?: number;
  /** Persisted layout preset for visual clips; legacy clips default to custom. */
  cameraLayoutPreset?: CameraLayoutPreset;
  /** Persisted framing preset for visual clips; legacy clips default to custom. */
  cameraFramingPreset?: CameraFramingPreset;
  /** Camera share of the canvas for split layouts, from 0.2 to 0.8. */
  cameraSplitRatio?: number;
  /** Inset around both split regions, normalized against the canvas. */
  cameraSplitPadding?: number;
  /** Whether a webcam overlay keeps its screen-relative size while the canvas zooms. */
  reactToZoom?: boolean;
}

export interface BlurClip extends ClipBase {
  kind: 'blur';
  /** Kept empty by construction so generic clip consumers can safely inspect assetId. */
  assetId: string;
  transform: NormalizedTransform;
  shape: BlurEffectShape;
  mode: BlurEffectMode;
  strength: number;
  feather: number;
  /** Optional for blur clips saved before rounded masks were introduced. */
  cornerRadius?: number;
  tintOpacity: number;
  color: string;
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

export type Clip = VisualClip | BlurClip | AudioClip | CaptionClip;

export interface ClipComposition {
  schemaVersion: number;
  assets: MediaAsset[];
  clips: Clip[];
  keyboardCaptionSessions: string[];
}

export const emptyComposition = (): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets: [],
  clips: [],
  keyboardCaptionSessions: [],
});

export const clipEndMs = (clip: Pick<ClipBase, 'timelineStartMs' | 'timelineDurationMs'>) =>
  clip.timelineStartMs + clip.timelineDurationMs;

export const isVisualClip = (clip: Clip): clip is VisualClip =>
  clip.kind === 'screen' || clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'webcam';

export const isBlurClip = (clip: Clip): clip is BlurClip => clip.kind === 'blur';
export const isCompositingClip = (clip: Clip): clip is VisualClip | BlurClip => isVisualClip(clip) || isBlurClip(clip);

export const isAudioClip = (clip: Clip): clip is AudioClip => clip.kind === 'audio';
export const isCaptionClip = (clip: Clip): clip is CaptionClip => clip.kind === 'caption';
export const isTextCaptionClip = (clip: Clip): clip is CaptionClip & { caption: TextCaptionData } =>
  clip.kind === 'caption' && clip.caption.type === 'text';
export const isKeyboardCaptionClip = (clip: Clip): clip is CaptionClip & { caption: KeyboardCaptionData } =>
  clip.kind === 'caption' && clip.caption.type === 'keyboard';

export const getCaptionTransform = (clip: CaptionClip): NormalizedTransform => {
  if (clip.transform) return clip.transform;
  const placement = clip.caption.style.placement;
  const y = placement === 'top' ? 0.06 : placement === 'center' ? 0.43 : 0.8;
  return { x: 0.1, y, width: 0.8, height: 0.14 };
};
