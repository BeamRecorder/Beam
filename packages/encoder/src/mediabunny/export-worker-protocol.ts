import type { ExportProgress, ExportRequest, ExportValidationIssue } from '@beam/encoder/export-types';
import type { ExportRuntimeDiagnostics } from '@beam/encoder/export-diagnostics-types';
import type { PreparedCursorImage } from '@beam/encoder/mediabunny/export-cursor-images';
import { isEngineMetricsSnapshot } from '@beam/runtime/performance/engine-metrics-protocol';

export type ExportWorkerRequest =
  | { type: 'start'; request: ExportRequest; cursorImages: PreparedCursorImage[] }
  | { type: 'cancel' }
  | { type: 'chunkAck'; sequence: number }
  | { type: 'chunkError'; sequence: number; message: string };

export type ExportWorkerResponse =
  | { type: 'progress'; progress: ExportProgress }
  | { type: 'chunk'; sequence: number; position: number; data: Uint8Array }
  | { type: 'disposed' }
  | { type: 'complete'; diagnostics: ExportRuntimeDiagnostics }
  | { type: 'error'; error: { name: string; message: string; issue?: ExportValidationIssue } };

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');
const sequence = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nullableFinite = (value: unknown) => value === null || finite(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const runtimeDiagnostics = (value: unknown): value is ExportRuntimeDiagnostics => {
  if (!record(value)) return false;
  return (
    (value.engine === undefined || isEngineMetricsSnapshot(value.engine)) &&
    ['validating_assets', 'loading_assets', 'encoding', 'finalizing'].includes(value.phase as string) &&
    finite(value.elapsedMs) &&
    nullableFinite(value.validationMs) &&
    nullableFinite(value.assetLoadingMs) &&
    nullableFinite(value.outputSetupMs) &&
    nullableFinite(value.videoPipelineMs) &&
    nullableFinite(value.audioPipelineMs) &&
    nullableFinite(value.muxFinalizationMs) &&
    nullableFinite(value.nativeFinalizationMs) &&
    finite(value.decodeMs) &&
    finite(value.renderMs) &&
    finite(value.encoderBackpressureMs) &&
    finite(value.ipcWriteWaitMs) &&
    nullableFinite(value.encodedFps) &&
    nullableFinite(value.audioRealtimeSpeed) &&
    sequence(value.chunkCount) &&
    sequence(value.bytesWritten) &&
    (value.videoCodec === null || typeof value.videoCodec === 'string') &&
    (value.audioCodec === null || typeof value.audioCodec === 'string') &&
    (value.audioEncoderImplementation === undefined ||
      value.audioEncoderImplementation === 'webcodecs' ||
      value.audioEncoderImplementation === 'mediabunny-aac') &&
    strings(value.inputVideoCodecs) &&
    strings(value.inputAudioCodecs) &&
    (value.hardwareAcceleration === undefined ||
      value.hardwareAcceleration === 'no-preference' ||
      value.hardwareAcceleration === 'prefer-hardware' ||
      value.hardwareAcceleration === 'prefer-software') &&
    (value.encoderCodec === undefined || value.encoderCodec === null || typeof value.encoderCodec === 'string') &&
    (value.encoderBitrate === undefined || nullableFinite(value.encoderBitrate)) &&
    (value.encoderBitrateMode === undefined ||
      value.encoderBitrateMode === 'variable' ||
      value.encoderBitrateMode === 'constant') &&
    (value.hardwareEncoderCheck === undefined ||
      value.hardwareEncoderCheck === 'passed' ||
      value.hardwareEncoderCheck === 'unsupported' ||
      value.hardwareEncoderCheck === 'failed') &&
    (value.hardwareEncoderError === undefined ||
      value.hardwareEncoderError === null ||
      (typeof value.hardwareEncoderError === 'string' && value.hardwareEncoderError.length <= 600)) &&
    (value.encodedPacketCount === undefined || sequence(value.encodedPacketCount)) &&
    (value.keyFrameCount === undefined || sequence(value.keyFrameCount)) &&
    (value.encodedVideoBytes === undefined || sequence(value.encodedVideoBytes))
  );
};

export function isExportWorkerRequest(value: unknown): value is ExportWorkerRequest {
  if (!record(value) || typeof value.type !== 'string') return false;
  if (value.type === 'start') {
    if (!record(value.request) || !record(value.request.snapshot) || !Array.isArray(value.cursorImages)) return false;
    const cursorIds = new Set<string>();
    const validCursorImages = value.cursorImages.every((image) => {
      if (!record(image) || typeof image.id !== 'string' || !image.id || cursorIds.has(image.id)) return false;
      if (!record(image.bitmap)) return false;
      cursorIds.add(image.id);
      const width = image.bitmap.width;
      const height = image.bitmap.height;
      return sequence(width) && (width as number) > 0 && sequence(height) && (height as number) > 0;
    });
    return (
      validCursorImages &&
      (value.request.frameSources === undefined ||
        (Array.isArray(value.request.frameSources) &&
          value.request.frameSources.length <= 100 &&
          value.request.frameSources.every(
            (source) =>
              record(source) &&
              typeof source.assetId === 'string' &&
              Boolean(source.assetId) &&
              typeof source.url === 'string' &&
              Boolean(source.url),
          ))) &&
      (value.request.preview === undefined || typeof value.request.preview === 'boolean') &&
      typeof value.request.projectName === 'string' &&
      (value.request.format === 'webm' || value.request.format === 'mp4') &&
      ['low', 'medium', 'high'].includes(value.request.preset as string) &&
      (value.request.includeAudio === undefined || typeof value.request.includeAudio === 'boolean') &&
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
  if (value.type === 'disposed') return true;
  if (value.type === 'complete') return runtimeDiagnostics(value.diagnostics);
  if (value.type === 'chunk')
    return (
      sequence(value.sequence) && sequence(value.position) && value.data instanceof Uint8Array && value.data.length > 0
    );
  if (value.type === 'progress') {
    if (!record(value.progress)) return false;
    const progress = value.progress;
    return (
      ['validating_assets', 'loading_assets', 'encoding', 'finalizing'].includes(progress.stage as string) &&
      (progress.preview === undefined ||
        (typeof progress.preview === 'string' &&
          progress.preview.length < 200_000 &&
          /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(progress.preview))) &&
      finite(progress.overallProgress) &&
      progress.overallProgress >= 0 &&
      progress.overallProgress <= 1 &&
      sequence(progress.completedImages) &&
      sequence(progress.totalImages) &&
      (progress.audioProgress === null ||
        (finite(progress.audioProgress) && progress.audioProgress >= 0 && progress.audioProgress <= 1)) &&
      sequence(progress.currentTimeMs) &&
      sequence(progress.totalTimeMs) &&
      (progress.diagnostics === undefined || runtimeDiagnostics(progress.diagnostics))
    );
  }
  return value.type === 'error' && record(value.error) && typeof value.error.message === 'string';
}
