export type EditorLoadingStage =
  | 'openingWindow'
  | 'loadingEditor'
  | 'loadingAppearance'
  | 'loadingProject'
  | 'loadingTimeline'
  | 'loadingEditorModule'
  | 'initializingEditor'
  | 'renderingEditor'
  | 'loadingPreview'
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
