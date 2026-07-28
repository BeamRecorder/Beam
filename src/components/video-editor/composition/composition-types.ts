export type CompositionMediaKind = "video" | "image" | "audio";
export type CompositionLayerKind = CompositionMediaKind | "caption";

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
  shadowDirection?: "all" | "bottom" | "bottom-right" | "top-left";
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  backdropBlur?: number;
  boxColor?: string;
  boxPadding?: number;
  boxRadius?: number;
  placement: "top" | "center" | "bottom";
  customText?: string;
}
export interface CaptionData {
  sentences: CaptionSentence[];
  style: CaptionStyle;
}
export interface WebcamAppearance {
  shadowSize: "none" | "sm" | "md" | "lg";
  cornerRadius: "none" | "sm" | "md" | "lg" | "full" | number;
}
export interface ClipAppearance extends WebcamAppearance {
  shadowColor: string;
  shadowDirection: "all" | "bottom" | "bottom-right" | "top-left";
  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number;
  frame: ClipFrame;
  frameTitle: string;
  frameColor: string;
  frameShowMenu: boolean;
  frameShowScrollbars: boolean;
}
export type ClipFrame = "none" | "safari" | "windows-95";
export interface CompositionMedia {
  id: string;
  kind: CompositionMediaKind;
  name: string;
  fileName: string | null;
  durationMs: number;
  width: number | null;
  height: number | null;
  src: string;
  origin?: "project" | "session";
  sessionId?: string;
  sessionPath?: string;
}
export interface CompositionLayerBase {
  id: string;
  kind: CompositionLayerKind;
  name: string;
  startMs: number;
  endMs: number;
  enabled: boolean;
  order: number;
  /** Clips sharing this id keep their timeline edits in sync until detached. */
  groupId?: string;
}
export interface MediaCompositionLayer extends CompositionLayerBase {
  kind: CompositionMediaKind;
  assetId: string;
  transform?: NormalizedTransform;
  crop?: NormalizedCrop;
  sourceOffsetMs?: number;
  reactToZoom?: boolean;
  webcamAppearance?: WebcamAppearance;
  appearance?: ClipAppearance;
  playbackRate?: number;
  /** Per-clip gain for imported audio, expressed as a percentage. */
  volume?: number;
  isMirrored?: boolean;
}
export interface CaptionCompositionLayer extends CompositionLayerBase {
  kind: "caption";
  caption: CaptionData;
  transform?: NormalizedTransform;
  isAiGenerated?: boolean;
}

export function getCaptionTransform(layer: CaptionCompositionLayer): NormalizedTransform {
  if (layer.transform) return layer.transform;
  const placement = layer.caption?.style?.placement ?? "bottom";
  const y = placement === "top" ? 0.06 : placement === "center" ? 0.43 : 0.8;
  return { x: 0.1, y, width: 0.8, height: 0.14 };
}
export type CompositionLayer = MediaCompositionLayer | CaptionCompositionLayer;

/** Identifiers used by the single visual compositing stack (front to back). */
export const BASE_VIDEO_TRACK_ID = "base-video";
export const WEBCAM_TRACK_ID = "webcam";
export type VisualTrackId = typeof BASE_VIDEO_TRACK_ID | typeof WEBCAM_TRACK_ID | string;
export type SessionSidecarKey = "camera" | "system-audio" | "microphone";
export interface TimelineRange { startMs: number; endMs: number; }
/** A non-destructive portion of the captured session. Timeline positions are derived
 * from the active segments, never stored, so deleting one naturally ripples later
 * session media to the left. */
export interface SessionSegment {
  id: string;
  /** Immutable bounds of this segment in the captured source. */
  sourceStartMs: number;
  sourceEndMs: number;
  /** Editable bounds rendered on the compacted timeline. Older projects omit
   * these fields; they are normalized to the immutable source bounds. */
  activeStartMs?: number;
  activeEndMs?: number;
  /** Clip-local presentation and speed. These must not leak to sibling cuts. */
  playbackRate?: number;
  appearance?: ClipAppearance;
  active: boolean;
}

export interface ProjectComposition {
  media: CompositionMedia[];
  layers: CompositionLayer[];
  /** Visual tracks ordered from foreground (timeline top) to background. */
  visualTrackOrder?: VisualTrackId[];
  baseVideoAppearance?: ClipAppearance;
  baseVideoCrop?: NormalizedCrop;
  baseVideoTransform?: NormalizedTransform;
  baseVideoIsMirrored?: boolean;
  baseVideoPlaybackRate?: number;
  /** Non-destructive edit points shared by the recorded video and audio tracks. */
  sessionSegments?: SessionSegment[];
  /** Session tracks deliberately detached from the primary screen recording. */
  detachedSessionSidecars?: SessionSidecarKey[];
}

export const emptyComposition = (): ProjectComposition => ({
  media: [],
  layers: [],
});
export const activeLayersAt = (
  composition: ProjectComposition,
  timeMs: number,
) =>
  composition.layers
    .filter(
      (layer) =>
        layer.enabled && layer.startMs <= timeMs && timeMs <= layer.endMs,
    )
    // A smaller order is a lane nearer the top of the timeline. Draw it last
    // so that the top lane is also the foreground layer in preview/export.
    .sort((a, b) => b.order - a.order);
