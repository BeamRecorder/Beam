import type { TimelineCanvasArtwork, TimelineCanvasItem } from '@beam/runtime/timeline/timeline-canvas-types';
import type { Clip, MediaAsset } from '@beam/engine/shared/composition-types';
import type { TimelineClipProps } from './timeline-clip-types';
import type { TimelineViewportMetrics } from './composables/timeline-virtualization-types';
import type { InjectionKey, ShallowRef } from 'vue';
import type { TimelineArtworkImages } from './timeline-artwork-images';

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
export interface TimelineVisualClipsProps {
  clips: readonly Clip[];
  canvas?: TimelineClipProps['canvas'];
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
