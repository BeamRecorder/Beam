export type EditorLayoutKind = 'video' | 'screenshot';

export interface EditorWorkspaceProps {
  kind: EditorLayoutKind;
}

export interface EditorLoadingFrameProps {
  aspectRatio?: number;
}

export interface EditorLoadingPropertiesProps {
  still: boolean;
}

export interface EditorLoadingLayoutProps {
  kind: EditorLayoutKind;
  timelineHeight?: number;
  aspectRatio?: number;
}

export interface EditorProjectLoadingProps {
  kind?: EditorLayoutKind;
  timelineHeight?: number;
  aspectRatio?: number;
  visible: boolean;
  label: string;
  showTopbarSkeleton?: boolean;
}
