import type { ExportProgress } from '../../../export/export-types';
import type { ZoomElement } from '../../zoom/zoom-types';
import type { ClipComposition } from '~/media/shared/composition-types';

export interface TimelineTracksProps {
  currentTime: number;
  duration: number;
  zoomLevel: number;
  exportProgress?: ExportProgress | null;
  zoomElements: ZoomElement[];
  selectedZoomId: string | null;
  composition: ClipComposition;
  selectedClipId: string | null;
  isSnappingEnabled?: boolean;
}

export interface TimelineTracksEmits {
  (event: 'update:currentTime', value: number): void;
  (event: 'update:zoomLevel', value: number): void;
  (event: 'select:zoom', zoomId: string): void;
  (event: 'select:clip', clipId: string): void;
  (event: 'toggle:clip', clipId: string): void;
  (event: 'trim:clip', payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
  (event: 'move:clip', payload: { id: string; startMs: number }): void;
  (event: 'trim:zoom', payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
  (event: 'move:zoom', payload: { id: string; startMs: number; endMs: number }): void;
  (event: 'add:zoom', timeMs: number): void;
  (event: 'add:caption', timeMs: number): void;
  (event: 'reorder:clip', payload: { id: string; targetIndex: number }): void;
}
