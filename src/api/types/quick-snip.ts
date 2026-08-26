import type { EditorPreset } from './editor-preset';
import type { ScreenRegion, ScreenRegionBounds } from './screen-region';

export type QuickSnipMode = 'studio' | 'raw';

export type QuickSnipState =
  | 'idle'
  | 'selecting'
  | 'preparing'
  | 'recording'
  | 'finalizing'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface QuickSnipConfiguration {
  mode: QuickSnipMode;
  format: 'mp4' | 'webm';
  name: string;
  preset: EditorPreset;
  automaticZoom: boolean;
  region: ScreenRegion;
  regionBounds: ScreenRegionBounds;
  displayId: string;
  screenId?: string;
  outputRoot?: string;
  rawOutputRoot?: string;
  devices: Record<string, unknown>;
  hideWhileRecording?: boolean;
  excludedWindowHandle?: string;
  projectId?: string | null;
  thumbnail?: string | null;
}

export interface QuickSnipSnapshot {
  state: QuickSnipState;
  job: QuickSnipConfiguration | null;
  progress: number;
  result: { path: string; projectId: string | null } | null;
  error: string | null;
}
