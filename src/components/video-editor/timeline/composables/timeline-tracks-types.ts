import type { ExportProgress } from '../../../export/export-types';
import type { ZoomElement } from '../../zoom/zoom-types';
import type { BlurClip, ClipComposition, VisualClip } from '~/media/shared/composition-types';
import type { TimelineClipboardItem, TimelinePasteHighlight, TimelinePasteRequest } from './timeline-clipboard-types';
import type { OutputCanvasSettings } from '../../canvas/output-canvas';

export interface VisualTimelineTrack {
  id: string;
  clips: Array<VisualClip | BlurClip>;
  representative: VisualClip | BlurClip;
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
  composition: ClipComposition;
  selectedClipId: string | null;
  isSnappingEnabled?: boolean;
  projectId?: string | null;
  recentPaste?: TimelinePasteHighlight | null;
  canvas?: OutputCanvasSettings;
}

export interface TimelineTracksEmits {
  (event: 'update:currentTime', value: number): void;
  (event: 'update:zoomLevel', value: number): void;
  (event: 'select:zoom', zoomId: string): void;
  (event: 'select:clip', clipId: string): void;
  (event: 'toggle:clip', clipId: string): void;
  (event: 'delete:clips', clipIds: string[]): void;
  (event: 'delete:zoom', zoomId: string): void;
  (event: 'trim:clip', payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
  (event: 'move:clip', payload: { id: string; startMs: number }): void;
  (event: 'preview:composition', value: ClipComposition | null): void;
  (event: 'trim:zoom', payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
  (event: 'move:zoom', payload: { id: string; startMs: number; endMs: number }): void;
  (event: 'add:zoom', timeMs: number): void;
  (event: 'add:caption', timeMs: number): void;
  (event: 'reorder:clip', payload: { id: string; targetIndex: number }): void;
  (event: 'paste:item', payload: TimelinePasteRequest): void;
  (event: 'paste:error', message: string): void;
  (event: 'clipboard:copied', item: TimelineClipboardItem): void;
  (event: 'preview:canvas', value: OutputCanvasSettings | null): void;
  (event: 'update:canvas', value: OutputCanvasSettings): void;
  (event: 'open:canvas-transition', edge: 'entry' | 'exit'): void;
}
