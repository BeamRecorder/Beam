import type { ExportProgress, ExportRequest, ExportValidationIssue } from '../export-types';

export type ExportWorkerRequest =
  | { type: 'start'; request: ExportRequest }
  | { type: 'cancel' }
  | { type: 'chunkAck'; sequence: number }
  | { type: 'chunkError'; sequence: number; message: string };

export type ExportWorkerResponse =
  | { type: 'progress'; progress: ExportProgress }
  | { type: 'chunk'; sequence: number; position: number; data: Uint8Array }
  | { type: 'complete' }
  | { type: 'error'; error: { name: string; message: string; issue?: ExportValidationIssue } };

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');
const sequence = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function isExportWorkerRequest(value: unknown): value is ExportWorkerRequest {
  if (!record(value) || typeof value.type !== 'string') return false;
  if (value.type === 'start') {
    if (!record(value.request) || !record(value.request.snapshot)) return false;
    return (
      typeof value.request.projectName === 'string' &&
      (value.request.format === 'webm' || value.request.format === 'mp4') &&
      ['low', 'medium', 'high'].includes(value.request.preset as string) &&
      finite(value.request.snapshot.duration) &&
      value.request.snapshot.duration > 0
    );
  }
  if (value.type === 'cancel') return true;
  if (value.type === 'chunkAck') return sequence(value.sequence);
  return value.type === 'chunkError' && sequence(value.sequence) && typeof value.message === 'string';
}

export function isExportWorkerResponse(value: unknown): value is ExportWorkerResponse {
  if (!record(value) || typeof value.type !== 'string') return false;
  if (value.type === 'complete') return true;
  if (value.type === 'chunk')
    return (
      sequence(value.sequence) && sequence(value.position) && value.data instanceof Uint8Array && value.data.length > 0
    );
  if (value.type === 'progress') {
    if (!record(value.progress)) return false;
    const progress = value.progress;
    return (
      ['validating_assets', 'loading_assets', 'encoding', 'finalizing'].includes(progress.stage as string) &&
      finite(progress.overallProgress) &&
      progress.overallProgress >= 0 &&
      progress.overallProgress <= 1 &&
      sequence(progress.completedImages) &&
      sequence(progress.totalImages) &&
      (progress.audioProgress === null ||
        (finite(progress.audioProgress) && progress.audioProgress >= 0 && progress.audioProgress <= 1)) &&
      sequence(progress.currentTimeMs) &&
      sequence(progress.totalTimeMs)
    );
  }
  return value.type === 'error' && record(value.error) && typeof value.error.message === 'string';
}
