import type { ExportProgress } from '../../../export/export-types';
import type { ZoomElement } from '../../zoom/zoom-types';
import type { BlurClip, ClipComposition, ColorClip, ShapeClip, VisualClip } from '~/media/shared/composition-types';
import type { TimelineClipboardItem, TimelinePasteHighlight, TimelinePasteRequest } from './timeline-clipboard-types';
import type { OutputCanvasSettings } from '../../canvas/output-canvas';
import type { AddVisualElementRequest } from '../../composition/visual-element-types';
import type { TimelineElementKind } from '../timeline-element-types';

export interface VisualTimelineTrack {
  id: string;
  clips: Array<VisualClip | ColorClip | ShapeClip | BlurClip>;
  representative: VisualClip | ColorClip | ShapeClip | BlurClip;
  order: number;
}

export interface TimelineTracksProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  zoomLevel: number;
  exportProgress?: ExportProgress | null;
  includeAudioInExport?: boolean;
  zoomElements: ZoomElement[];
  newZoomDurationMs?: number;
  selectedZoomId: string | null;
  selectedZoomIds?: string[];
  composition: ClipComposition;
  selectedClipId: string | null;
  selectedClipIds?: string[];
  isSnappingEnabled?: boolean;
  projectId?: string | null;
  recentPaste?: TimelinePasteHighlight | null;
  canvas?: OutputCanvasSettings;
  voiceoverDraft?: LiveAudioDraft | null;
}

export interface LiveAudioDraft {
  startMs: number;
  durationMs: number;
  bars: number[];
}

export interface TrackClipSelection {
  clipIds: string[];
  primaryClipId: string | null;
  trackNames: string[];
  additive?: boolean;
}

export interface TrackZoomSelection {
  zoomIds: string[];
  primaryZoomId: string | null;
  additive?: boolean;
}

export interface TimelinePlacementRequest {
  startMs: number;
  durationMs: number;
}

export type TimelineItemKind = 'clip' | 'zoom';
export type TimelineSelectionIntent = 'replace' | 'toggle' | 'range';

export interface TimelineItemSelectionRequest {
  kind: TimelineItemKind;
  id: string;
  intent: TimelineSelectionIntent;
}

export interface TimelineSelectionIds {
  clipIds: string[];
  zoomIds: string[];
}

export interface TimelineSelectionMove extends TimelineSelectionIds {
  deltaMs: number;
}

export interface TimelineSelectionDelete extends TimelineSelectionIds {
  mode: 'lift' | 'ripple' | 'smart';
}

export interface TimelineTracksEmits {
  (event: 'add:element', kind: TimelineElementKind): void;
  (event: 'update:currentTime', value: number): void;
  (event: 'update:zoomLevel', value: number): void;
  (event: 'select:zoom', zoomId: string): void;
  (event: 'select:zoom-track', selection: TrackZoomSelection): void;
  (event: 'select:clip', clipId: string): void;
  (event: 'select:track', selection: TrackClipSelection): void;
  (event: 'select:item', selection: TimelineItemSelectionRequest): void;
  (event: 'select:all'): void;
  (event: 'toggle:clip', clipId: string): void;
  (event: 'delete:clips', clipIds: string[]): void;
  (event: 'delete:zoom', zoomId: string): void;
  (event: 'delete:selection', selection: TimelineSelectionDelete): void;
  (event: 'hold:clip', payload: { id: string; timeMs: number }): void;
  (event: 'trim:clip', payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
  (event: 'move:clip', payload: { id: string; startMs: number }): void;
  (event: 'preview:composition', value: ClipComposition | null): void;
  (event: 'trim:zoom', payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
  (event: 'move:zoom', payload: { id: string; startMs: number; endMs: number }): void;
  (event: 'move:selection', payload: TimelineSelectionMove): void;
  (event: 'add:zoom', placement: TimelinePlacementRequest): void;
  (event: 'add:caption', placement: TimelinePlacementRequest): void;
  (event: 'add:visual-element', request: AddVisualElementRequest): void;
  (event: 'reorder:clip', payload: { id: string; targetIndex: number }): void;
  (event: 'reorder:caption', payload: { id: string; targetIndex: number }): void;
  (event: 'paste:item', payload: TimelinePasteRequest): void;
  (event: 'paste:error', message: string): void;
  (event: 'clipboard:copied', item: TimelineClipboardItem): void;
  (event: 'preview:canvas', value: OutputCanvasSettings | null): void;
  (event: 'update:canvas', value: OutputCanvasSettings): void;
  (event: 'open:canvas-transition', edge: 'entry' | 'exit'): void;
  (event: 'normalize:audio', clipIds: string[]): void;
}
