import type { ClipComposition } from '../shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';

export interface RecordingPauseCleanup {
  composition: ClipComposition;
  zoomElements: ZoomElement[];
  removedCount: number;
  removedDurationMs: number;
}
