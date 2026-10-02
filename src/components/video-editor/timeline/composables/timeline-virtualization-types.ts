import type { ComputedRef, CSSProperties, Ref } from 'vue';
import type { Clip, CaptionClip, AudioClip } from '~/media/shared/composition-types';
import type { ZoomElement } from '../../zoom/zoom-types';
import type { SelectionTarget } from './timeline-box-selection-types';
import type { VisualTimelineTrack } from './timeline-tracks-types';
import type { TextCaptionLayer } from '../../composition/engine/caption-layer-layout';
import type { ImportedAudioTimelineTrack } from './audio-timeline-tracks';

export type TimelineRowKind = 'visual' | 'effect' | 'audio';
export interface TimelineVirtualRow {
  id: string;
  kind: TimelineRowKind;
  clips: readonly Clip[];
  zooms?: readonly ZoomElement[];
}
export interface TimelinePositionedRow extends TimelineVirtualRow {
  top: number;
  height: number;
}
export interface TimelineVirtualWindow {
  rows: ComputedRef<TimelinePositionedRow[]>;
  visibleIds: ComputedRef<Set<string>>;
  stackStyle: ComputedRef<CSSProperties>;
  timeRange: ComputedRef<{ start: number; end: number }>;
  rowStyle: (id: string) => CSSProperties | undefined;
  visibleClips: <T extends Clip>(clips: readonly T[]) => T[];
  visibleZooms: (zooms: readonly ZoomElement[]) => ZoomElement[];
  selectionTargets: () => SelectionTarget[];
  captureInteraction: (event: PointerEvent) => void;
}
export interface TimelineVirtualizationOptions {
  rows: () => TimelineVirtualRow[];
  scroll: Ref<HTMLDivElement | null>;
  durationMs: Ref<number>;
  width: Ref<number>;
  viewport: TimelineViewportMetrics;
}
export interface TimelineViewportMetrics {
  top: number;
  left: number;
  width: number;
  height: number;
}
export interface TimelineRowsOptions {
  visualTracks: readonly VisualTimelineTrack[];
  zooms: readonly ZoomElement[];
  keyboard: readonly CaptionClip[];
  textLayers: readonly TextCaptionLayer[];
  system: readonly AudioClip[];
  microphone: readonly AudioClip[];
  voiceovers: readonly AudioClip[];
  importedAudio: readonly ImportedAudioTimelineTrack[];
  canvasTransition: boolean;
  voiceoverDraft: boolean;
}
