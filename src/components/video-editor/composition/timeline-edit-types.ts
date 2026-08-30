import type { ClipComposition } from '~/media/shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';

export type TimelineDeleteMode = 'lift' | 'ripple' | 'smart';

export interface TimelineSelectionIds {
  clipIds: readonly string[];
  zoomIds: readonly string[];
}

export interface TimelineRange {
  startMs: number;
  endMs: number;
}

export interface TimelineEditResult {
  composition: ClipComposition;
  zoomElements: ZoomElement[];
  rippleRange: TimelineRange | null;
}
