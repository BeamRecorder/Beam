import type {
  PlaybackClipDescriptor,
  PlaybackMetrics,
  PlaybackWorkerRequest,
  PlaybackWorkerResponse,
} from './playback-types';

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const generation = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

function isClip(value: unknown): value is PlaybackClipDescriptor {
  if (!record(value)) return false;
  return (
    typeof value.clipId === 'string' &&
    typeof value.assetId === 'string' &&
    finite(value.timelineStartSeconds) &&
    value.timelineStartSeconds >= 0 &&
    finite(value.timelineDurationSeconds) &&
    value.timelineDurationSeconds > 0 &&
    finite(value.sourceInSeconds) &&
    value.sourceInSeconds >= 0 &&
    finite(value.playbackRate) &&
    value.playbackRate >= 0.25 &&
    value.playbackRate <= 4
  );
}

function isSource(value: unknown): boolean {
  if (!record(value)) return false;
  let protocol: string;
  try {
    protocol = new URL(typeof value.url === 'string' ? value.url : '').protocol;
  } catch {
    return false;
  }
  return (
    typeof value.assetId === 'string' &&
    value.assetId.length > 0 &&
    value.kind === 'video' &&
    (protocol === 'http:' || protocol === 'https:' || protocol === 'project-media:') &&
    typeof value.label === 'string' &&
    value.label.length > 0
  );
}

export function isPlaybackWorkerRequest(value: unknown): value is PlaybackWorkerRequest {
  if (!record(value) || typeof value.type !== 'string') return false;
  if (value.type === 'dispose') return true;
  if (!generation(value.generation)) return false;
  if (value.type === 'load') {
    return (
      Array.isArray(value.assets) &&
      value.assets.every(isSource) &&
      Array.isArray(value.clips) &&
      value.clips.every(isClip)
    );
  }
  if (value.type === 'pause') return true;
  if (value.type === 'play' || value.type === 'tick')
    return finite(value.timelineSeconds) && value.timelineSeconds >= 0;
  return (
    value.type === 'seek' &&
    Number.isSafeInteger(value.requestId) &&
    (value.requestId as number) >= 0 &&
    finite(value.timelineSeconds) &&
    value.timelineSeconds >= 0 &&
    (value.mode === 'seek' || value.mode === 'scrub')
  );
}

function isMetrics(value: unknown): value is PlaybackMetrics {
  if (!record(value) || !Array.isArray(value.seekLatencyMs) || !value.seekLatencyMs.every(finite)) return false;
  return [
    'decodedFrames',
    'presentedFrames',
    'droppedFrames',
    'supersededRequests',
    'queueSize',
    'cacheBytes',
    'disposedBitmaps',
  ].every((key) => finite(value[key]) && (value[key] as number) >= 0);
}

function isFrame(value: Record<string, unknown>): boolean {
  return (
    typeof value.clipId === 'string' &&
    typeof value.assetId === 'string' &&
    typeof ImageBitmap !== 'undefined' &&
    value.bitmap instanceof ImageBitmap &&
    finite(value.timestampSeconds) &&
    finite(value.durationSeconds)
  );
}

function isMediaError(value: unknown): boolean {
  if (
    !record(value) ||
    typeof value.kind !== 'string' ||
    typeof value.sourceId !== 'string' ||
    typeof value.message !== 'string'
  ) {
    return false;
  }
  if (
    value.kind === 'missing' ||
    value.kind === 'invalid-container' ||
    value.kind === 'empty' ||
    value.kind === 'disposed'
  ) {
    return true;
  }
  if (value.kind === 'missing-track') return value.track === 'video' || value.track === 'audio';
  if (value.kind === 'unsupported-codec') {
    return (
      (value.track === 'video' || value.track === 'audio') && (value.codec === null || typeof value.codec === 'string')
    );
  }
  return value.kind === 'decode-failure';
}

export function isPlaybackWorkerResponse(value: unknown): value is PlaybackWorkerResponse {
  if (!record(value) || typeof value.type !== 'string' || !generation(value.generation)) return false;
  if (value.type === 'ready') return true;
  if (value.type === 'frame') return isFrame(value);
  if (value.type === 'metrics') return isMetrics(value.metrics);
  if (value.type === 'seek-result') {
    return (
      Number.isSafeInteger(value.requestId) &&
      (value.requestId as number) >= 0 &&
      (value.result === 'presented' || value.result === 'superseded') &&
      finite(value.latencyMs)
    );
  }
  return value.type === 'error' && isMediaError(value.error);
}

export function assertPlaybackWorkerRequest(value: unknown): asserts value is PlaybackWorkerRequest {
  if (!isPlaybackWorkerRequest(value)) throw new TypeError('Invalid playback worker request.');
}

export function assertPlaybackWorkerResponse(value: unknown): asserts value is PlaybackWorkerResponse {
  if (!isPlaybackWorkerResponse(value)) throw new TypeError('Invalid playback worker response.');
}
