export type EditorLoadingStage =
  'openingWindow' | 'loadingEditor' | 'loadingProject' | 'loadingTimeline' | 'renderingEditor' | 'ready';

export interface EditorLoadingProgress {
  stage: EditorLoadingStage;
  value: number;
}
