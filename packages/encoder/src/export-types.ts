import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { ExportDiagnostics, ExportRuntimeDiagnostics } from '@beam/encoder/export-diagnostics-types';

export type ExportFormat = 'webm' | 'mp4';
export type ExportPreset = 'low' | 'medium' | 'high';
export type ExportStage = 'validating_assets' | 'loading_assets' | 'encoding' | 'finalizing';

export interface ExportProgress {
  preview?: string;
  stage: ExportStage;
  stageLabel?: string;
  overallProgress: number;
  completedImages: number;
  totalImages: number;
  audioProgress: number | null;
  currentTimeMs: number;
  totalTimeMs: number;
  diagnostics?: ExportRuntimeDiagnostics;
}
export interface ExportResult {
  path: string;
  format: ExportFormat;
  diagnostics: ExportDiagnostics;
}
export interface ExportRequest {
  preview?: boolean;
  projectName: string;
  format: ExportFormat;
  preset: ExportPreset;
  /** Defaults to true for requests created before this option existed. */
  includeAudio?: boolean;
  snapshot: CompositionSnapshot;
  frameSources?: import('@beam/runtime/frames/frame-source-types').HttpFrameSourceDescriptor[];
}

/** Live UI metadata; expensive, owned render data is captured only when export starts. */
export interface EditorExportSource {
  projectName: string;
  includeAudio: boolean;
  duration: number;
  fps: number;
  width: number;
  height: number;
  createSnapshot: () => CompositionSnapshot;
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
