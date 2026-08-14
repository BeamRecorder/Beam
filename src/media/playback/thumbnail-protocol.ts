export const THUMBNAIL_WIDTH = 240;

export interface ThumbnailRequest {
  type: 'request-frames';
  generation: number;
  source: MediaSourceDescriptor;
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

const approvedSourceUrl = (value: unknown) => {
  if (typeof value !== 'string') return false;
  try {
    return ['http:', 'https:', 'project-media:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

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
    Boolean(
      message.source &&
      typeof message.source === 'object' &&
      typeof message.source.assetId === 'string' &&
      message.source.assetId.length > 0 &&
      message.source.kind === 'video' &&
      approvedSourceUrl(message.source.url) &&
      typeof message.source.label === 'string' &&
      message.source.label.length > 0,
    ) &&
    Array.isArray(message.visibleTimes) &&
    message.visibleTimes.every((time) => typeof time === 'number')
  );
}

export function isThumbnailWorkerResponse(value: unknown): value is ThumbnailWorkerResponse {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<ThumbnailWorkerResponse>;
  if (!Number.isSafeInteger(message.generation) || (message.generation ?? -1) < 0) return false;
  if (message.type === 'batch-started' || message.type === 'batch-finished') return true;
  if (message.type === 'error') return typeof message.message === 'string' && message.message.length > 0;
  return (
    message.type === 'frame-ready' &&
    typeof message.time === 'number' &&
    Number.isFinite(message.time) &&
    message.time >= 0 &&
    message.blob instanceof Blob
  );
}

export function assertThumbnailWorkerResponse(value: unknown): asserts value is ThumbnailWorkerResponse {
  if (!isThumbnailWorkerResponse(value)) throw new TypeError('Invalid thumbnail worker response.');
}
import type { MediaSourceDescriptor } from '../shared';
