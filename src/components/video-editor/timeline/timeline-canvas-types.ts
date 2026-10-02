import type { Clip, MediaAsset } from '@beam/engine/shared/composition-types';
import type { TimelineClipProps } from './timeline-clip-types';
import type { TimelineViewportMetrics } from './composables/timeline-virtualization-types';
import type { ColorClip, ClipTransition } from '@beam/engine/shared/composition-types';
import type { InjectionKey, ShallowRef } from 'vue';
import type { TimelineArtworkImages } from './timeline-artwork-images';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';

export interface TimelineCanvasPalette {
  background: string;
  text: string;
  border: string;
  selected: string;
  video: string;
  annotation: string;
  blur: string;
  audio: string;
  zoom: string;
  highlight: string;
  labelBackground: string;
  labelText: string;
  curve: string;
  radius: number;
  effectInset: number;
  effectHeight: number;
  tint: number;
  disabledOpacity: number;
}
export type TimelineCanvasItem = (
  | { clip: Clip }
  | { zoom: ZoomElement; label: string }
  | { transition: ClipTransition; edge: 'entry' | 'exit'; label: string }
) & {
  selected: boolean;
  label?: string;
  pasteHighlight?: boolean;
  labelInset?: number;
};
export interface TimelineCanvasFrame {
  mediaSecond?: number;
  relativeMs: number;
  durationMs: number;
  source?: HTMLImageElement;
  pending: boolean;
}
export interface TimelineCanvasArtwork {
  kind: 'thumbnails' | 'image' | 'shape' | 'color';
  frames?: readonly TimelineCanvasFrame[];
  source?: HTMLImageElement;
  fill?: ColorClip['fill'];
  error?: string;
  loading?: boolean;
}
export interface TimelineCanvasRegistry {
  artworks: ShallowRef<ReadonlyMap<string, TimelineCanvasArtwork>>;
  images: TimelineArtworkImages;
  set(id: string, artwork: TimelineCanvasArtwork): void;
  delete(id: string): void;
}
export type TimelineCanvasRegistryKey = InjectionKey<TimelineCanvasRegistry>;
export interface TimelineCanvasLaneProps {
  items: readonly TimelineCanvasItem[];
  durationMs: number;
  width: number;
  viewport: TimelineViewportMetrics;
  artworks?: ReadonlyMap<string, TimelineCanvasArtwork>;
  reduceMotion?: boolean;
}
export interface TimelineCanvasMarquee {
  id: string;
  offset: number;
}
export interface TimelineVisualClipsProps {
  clips: readonly Clip[];
  canvas: TimelineClipProps['canvas'];
  durationMs: number;
  width: number;
  viewport: TimelineViewportMetrics;
  thumbnailSlots: TimelineClipProps['thumbnailSlots'];
  deferMedia: boolean;
  selectedIds: ReadonlySet<string>;
  pasteId?: string;
  displayedClip(clip: Clip): Clip;
  assetFor(clip: Clip): MediaAsset | null;
  linkedNames(clip: Clip): string[];
  trimStateFor(id: string): TimelineClipProps['trimState'];
  audioFor?(id: string): Partial<TimelineClipProps>;
  labelFor?(clip: Clip): string;
}
