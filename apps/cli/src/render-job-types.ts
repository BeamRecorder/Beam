import type { ExportRequest } from '@beam/encoder';
import type { StillDocument } from '@beam/engine';
import type { CursorPackDescriptor } from '@beam/engine/capture/cursor-pack';
export interface StillRenderJob {
  kind: 'image';
  document: StillDocument;
  cursorPacks?: CursorPackDescriptor[];
}
export interface VideoFrameJob {
  kind: 'frame';
  request: ExportRequest;
  timeMs: number;
}
export type CliRenderJob = ExportRequest | StillRenderJob | VideoFrameJob;
