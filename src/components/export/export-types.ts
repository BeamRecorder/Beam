import type { ProjectEditorData } from '../../api/types/capture-api';
import type { ZoomElement } from '../video-editor/zoom/zoom-types';
import type { ClipComposition } from '~/media/shared/composition-types';
import type { OutputCanvasSettings } from '../video-editor/canvas/output-canvas';
import type { CursorPresentationSettings } from '../../api/types/cursor-presentation';

export type ExportFormat = 'webm' | 'mp4';
export type ExportPreset = 'low' | 'medium' | 'high';
export type ExportStage = 'preparing' | 'audio_mixing' | 'loading_assets' | 'encoding' | 'finalizing';

export interface ExportProgress {
  stage: ExportStage;
  stageLabel?: string;
  completed: number;
  total: number;
  currentTimeMs?: number;
  totalTimeMs?: number;
}
export interface ExportResult {
  path: string;
  format: ExportFormat;
}
export interface ExportRenderSettings {
  fps: number;
  sourceWidth: number | null;
  sourceHeight: number | null;
}
export type CursorRenderSettings = CursorPresentationSettings;
export interface CompositionSnapshot {
  duration: number;
  render: ExportRenderSettings;
  canvas: OutputCanvasSettings;
  background:
    | { kind: 'color'; color: string }
    | { kind: 'gradient'; gradient: import('../video-editor/composables/backgroundCatalog').GradientBackground }
    | { kind: 'image' | 'video'; src: string }
    | null;
  blurPercent: number;
  zooms: ZoomElement[];
  cursor: ProjectEditorData['cursor'];
  cursorSettings: CursorRenderSettings;
  composition: ClipComposition;
}
export interface ExportRequest {
  projectName: string;
  format: ExportFormat;
  preset: ExportPreset;
  snapshot: CompositionSnapshot;
}

export type ExportValidationCode =
  | 'missing-asset'
  | 'unsupported-format'
  | 'invalid-source'
  | 'unsupported-codec'
  | 'decode-failure'
  | 'fps-unavailable'
  | 'render-invariant';

export interface ExportValidationIssue {
  code: ExportValidationCode;
  message: string;
  assetId?: string;
  clipId?: string;
  name?: string;
  expectedPath?: string;
  codec?: string | null;
}

export class ExportValidationError extends Error {
  readonly issue: ExportValidationIssue;

  constructor(issue: ExportValidationIssue) {
    super(issue.message);
    this.name = 'ExportValidationError';
    this.issue = issue;
  }
}

export interface PreparedExport {
  fps: number;
  activeClipIds: ReadonlySet<string>;
  images: ReadonlyMap<string, import('./composition/render').RenderableMedia>;
  backgroundImage: import('./composition/render').RenderableMedia | null;
  backgroundVideoDuration: number | null;
  mixedAudio: AudioBuffer | null;
  screenSize: { width: number; height: number } | null;
  dispose(): void;
}
