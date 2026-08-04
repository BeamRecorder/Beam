export const THUMBNAIL_WIDTH = 240;

export interface ThumbnailRequest {
  type: 'request-frames';
  generation: number;
  source: string;
  visibleTimes: number[];
}

export interface ThumbnailClearRequest {
  type: 'clear';
  generation: number;
}

export type ThumbnailWorkerRequest = ThumbnailRequest | ThumbnailClearRequest;

export type ThumbnailWorkerResponse =
  | { type: 'batch-started'; generation: number }
  | { type: 'batch-finished'; generation: number }
  | { type: 'frame-ready'; generation: number; time: number; blob: Blob }
  | { type: 'error'; generation: number; message: string };

export function uniqueSortedTimes(times: readonly number[]): number[] {
  return [...new Set(times.filter((time) => Number.isFinite(time) && time >= 0))].sort((left, right) => left - right);
}

export function isThumbnailWorkerRequest(value: unknown): value is ThumbnailWorkerRequest {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<ThumbnailWorkerRequest>;
  if (!Number.isInteger(message.generation) || (message.generation ?? -1) < 0) return false;
  if (message.type === 'clear') return true;
  return (
    message.type === 'request-frames' &&
    typeof message.source === 'string' &&
    Array.isArray(message.visibleTimes) &&
    message.visibleTimes.every((time) => typeof time === 'number')
  );
}
