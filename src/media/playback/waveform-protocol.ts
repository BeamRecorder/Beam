import type { MediaError, MediaSourceDescriptor } from '../shared';

export type WaveformWorkerRequest =
  | {
      type: 'extract';
      generation: number;
      clipId: string;
      source: MediaSourceDescriptor;
      startSeconds: number;
      endSeconds: number;
      pointCount: number;
      segmentIndex: number;
      segmentCount: number;
    }
  | { type: 'clear'; generation: number };

export type WaveformWorkerResponse =
  | {
      type: 'result';
      generation: number;
      clipId: string;
      peaks: Float32Array;
      segmentIndex: number;
      segmentCount: number;
      segmentPointOffset: number;
      segmentComplete: boolean;
    }
  | { type: 'error'; generation: number; clipId: string; error: MediaError };

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');
const generation = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const segment = (index: unknown, count: unknown) =>
  Number.isSafeInteger(index) &&
  Number.isSafeInteger(count) &&
  (index as number) >= 0 &&
  (count as number) > 0 &&
  (index as number) < (count as number);

const source = (value: unknown): value is MediaSourceDescriptor => {
  if (!record(value) || typeof value.url !== 'string') return false;
  let protocol: string;
  try {
    protocol = new URL(value.url).protocol;
  } catch {
    return false;
  }
  return (
    typeof value.assetId === 'string' &&
    value.assetId.length > 0 &&
    (value.kind === 'audio' || value.kind === 'video') &&
    typeof value.label === 'string' &&
    value.label.length > 0 &&
    ['http:', 'https:', 'project-media:'].includes(protocol)
  );
};

const mediaError = (value: unknown): value is MediaError => {
  if (!record(value) || typeof value.sourceId !== 'string' || typeof value.message !== 'string') return false;
  if (['missing', 'invalid-container', 'empty', 'disposed'].includes(value.kind as string)) return true;
  if (value.kind === 'missing-track') return value.track === 'audio' || value.track === 'video';
  if (value.kind === 'unsupported-codec') {
    return (
      (value.track === 'audio' || value.track === 'video') && (value.codec === null || typeof value.codec === 'string')
    );
  }
  return value.kind === 'decode-failure';
};

export function isWaveformWorkerRequest(value: unknown): value is WaveformWorkerRequest {
  if (!record(value) || !generation(value.generation)) return false;
  if (value.type === 'clear') return true;
  return (
    value.type === 'extract' &&
    typeof value.clipId === 'string' &&
    value.clipId.length > 0 &&
    source(value.source) &&
    finite(value.startSeconds) &&
    value.startSeconds >= 0 &&
    finite(value.endSeconds) &&
    value.endSeconds > value.startSeconds &&
    Number.isSafeInteger(value.pointCount) &&
    (value.pointCount as number) > 0 &&
    segment(value.segmentIndex, value.segmentCount)
  );
}

export function isWaveformWorkerResponse(value: unknown): value is WaveformWorkerResponse {
  if (!record(value) || !generation(value.generation) || typeof value.clipId !== 'string') return false;
  if (value.type === 'result') {
    return (
      value.peaks instanceof Float32Array &&
      value.peaks.length > 0 &&
      value.peaks.length % 2 === 0 &&
      segment(value.segmentIndex, value.segmentCount) &&
      Number.isSafeInteger(value.segmentPointOffset) &&
      (value.segmentPointOffset as number) >= 0 &&
      typeof value.segmentComplete === 'boolean'
    );
  }
  return value.type === 'error' && mediaError(value.error);
}

export function assertWaveformWorkerResponse(value: unknown): asserts value is WaveformWorkerResponse {
  if (!isWaveformWorkerResponse(value)) throw new TypeError('Invalid waveform worker response.');
}
