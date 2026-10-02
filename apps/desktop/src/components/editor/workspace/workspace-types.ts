import type { CaptureProject, ProjectEditorData } from '~/api/types/capture-api';
import type { useEditorWorkspaceState } from './useEditorWorkspaceState';
import type { useEditorWorkspaceHistory } from './useEditorWorkspaceHistory';
import type { useEditorWorkspaceSelection } from './useEditorWorkspaceSelection';
import type { useEditorWorkspaceTimeline } from './useEditorWorkspaceTimeline';
import type { useEditorWorkspaceCanvas } from './useEditorWorkspaceCanvas';
import type { useEditorWorkspaceMedia } from './useEditorWorkspaceMedia';
import type { useEditorWorkspace } from './useEditorWorkspace';
import type { CanvasFrameCapture } from '../canvas/canvas-frame-capture';
import type { useViewportZoom } from '../canvas/composables/useViewportZoom';
export interface EditorCanvasHandle {
  captureCurrentFrame(): Promise<CanvasFrameCapture>;
  viewportZoom: ReturnType<typeof useViewportZoom>;
}
export interface EditorPropertiesHandle {
  openCanvasTransitions(edge: 'entry' | 'exit'): void;
}
export interface EditorWorkspaceProps {
  project: CaptureProject | null;
  editorData: ProjectEditorData | null;
}
export interface EditorWorkspaceEmit {
  (event: 'ready'): void;
  (event: 'back-to-hud'): void;
  (event: 'open-project', project: CaptureProject): void;
}
export type EditorWorkspaceState = ReturnType<typeof useEditorWorkspaceState>;
export type EditorWorkspaceHistory = ReturnType<typeof useEditorWorkspaceHistory>;
export type EditorWorkspaceSelection = ReturnType<typeof useEditorWorkspaceSelection>;
export type EditorWorkspaceTimeline = ReturnType<typeof useEditorWorkspaceTimeline>;
export type EditorWorkspaceCanvas = ReturnType<typeof useEditorWorkspaceCanvas>;
export type EditorWorkspaceMedia = ReturnType<typeof useEditorWorkspaceMedia>;
export type EditorWorkspaceContext = ReturnType<typeof useEditorWorkspace>;
