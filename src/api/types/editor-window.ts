export type EditorLoadingStage =
  | 'openingWindow'
  | 'loadingEditor'
  | 'loadingProject'
  | 'loadingTimeline'
  | 'renderingEditor'
  | 'ready';

export interface EditorLoadingProgress {
  stage: EditorLoadingStage;
  value: number;
}

export interface EditorOpenOptions {
  disposition?: 'reuse' | 'new-window';
}

export interface RecorderLauncherContext {
  requestId: string;
  preferredKind: 'window';
  preferredSourceId: string | null;
}
