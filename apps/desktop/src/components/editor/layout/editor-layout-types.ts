import type { ScreenshotPropertiesPosition } from '../../screenshot/screenshot-properties-types';
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
  screenshotPropertiesPosition?: ScreenshotPropertiesPosition;
  timelineHeight?: number;
  aspectRatio?: number;
}

export interface EditorProjectLoadingProps {
  kind?: EditorLayoutKind;
  screenshotPropertiesPosition?: ScreenshotPropertiesPosition;
  timelineHeight?: number;
  aspectRatio?: number;
  visible: boolean;
  label: string;
  showTopbarSkeleton?: boolean;
}
