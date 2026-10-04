import type { ClipComposition } from '@beam/engine/shared/composition-types';
import type { ZoomAutoFollowSettings, ZoomElement, ZoomMotionBlurSettings } from '@beam/engine/zoom/zoom-types';
import type { OutputCanvasSettings } from '@beam/engine/layout/output-canvas';
import type { BackgroundValue } from '@beam/engine/shared/background-types';

export interface EditorStateSnapshot {
  composition: ClipComposition;
  zoomElements: ZoomElement[];
  zoomMotionBlur?: ZoomMotionBlurSettings;
  zoomAutoFollow?: ZoomAutoFollowSettings;
  outputCanvas: OutputCanvasSettings;
  selectedBackground: BackgroundValue | null;
  backgroundBlurPercent: number;
}
export type {
  HistoryActionType,
  HistoryAction,
  SnapshotSource,
  EditorHistoryOptions,
  SnapshotOwnership,
} from '@beam/engine/history/history-types';
