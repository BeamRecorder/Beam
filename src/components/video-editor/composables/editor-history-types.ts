import type { ClipComposition } from '~/media/shared/composition-types';
import type { ZoomElement, ZoomMotionBlurSettings } from '../zoom/zoom-types';
import type { OutputCanvasSettings } from '../canvas/output-canvas';
import type { BackgroundValue } from './backgroundCatalog';

export type HistoryActionType = 'undo' | 'redo';
export interface HistoryAction {
  type: HistoryActionType;
  timestamp: number;
}
export interface EditorStateSnapshot {
  composition: ClipComposition;
  zoomElements: ZoomElement[];
  zoomMotionBlur?: ZoomMotionBlurSettings;
  outputCanvas: OutputCanvasSettings;
  selectedBackground: BackgroundValue | null;
  backgroundBlurPercent: number;
}
export type SnapshotSource<T> = T | (() => T);
export interface EditorHistoryOptions<T> {
  onRestoreSnapshot: (snapshot: T) => void | Promise<void>;
  disabled?: () => boolean;
}
export type SnapshotOwnership = 'copy' | 'transfer';
