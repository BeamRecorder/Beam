import type { EditorPreset } from './editor-preset';
import type { ScreenRegion, ScreenRegionBounds } from './screen-region';

export type QuickSnipMode = import('./capture-mode').CaptureMode;

export type QuickSnipDeviceKind = 'microphone' | 'camera' | 'systemAudio';

export interface QuickSnipDeviceMenu {
  kind: QuickSnipDeviceKind;
  selectedId: string;
  options: Array<{ id: string; label: string }>;
  position?: { x: number; y: number };
}

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
  screenKind: 'display' | 'window';
  region: ScreenRegion | null;
  regionBounds: ScreenRegionBounds;
  displayId: string;
  screenId?: string;
  outputRoot?: string;
  screenshotAction?: 'copy' | 'edit';
  devices: Record<string, unknown>;
  excludedWindowHandle?: string;
  projectId?: string | null;
  thumbnail?: string | null;
}

export interface QuickSnipAutoClose {
  durationMs: number;
  /** Native deadline, absent while hidden or interaction has suspended dismissal. */
  deadlineMs: number | null;
  remainingMs: number;
}

export interface QuickSnipSnapshot {
  state: QuickSnipState;
  job: QuickSnipConfiguration | null;
  progress: number;
  result: { path: string; projectId: string | null } | null;
  error: string | null;
  etaSeconds?: number | null;
  preview?: string | null;
  copied?: boolean;
  clipboardError?: string | null;
  popoverSide?: 'above' | 'below';
  autoClose?: QuickSnipAutoClose | null;
}

export interface QuickSnipRenderTask {
  id: string;
  configuration: QuickSnipConfiguration;
  editorData: import('./capture-api').ProjectEditorData;
  editorState: import('./capture-api').ProjectEditorState;
}

export type QuickSnipRenderReport =
  | { id: string; type: 'progress'; progress: number; preview?: string }
  | { id: string; type: 'completed'; path: string }
  | { id: string; type: 'failed'; error: string };

export interface InstantCaptureOptions {
  screenKind?: 'display' | 'window';
  screenId?: string;
  region?: ScreenRegion | null;
  devices?: Record<string, unknown>;
}
