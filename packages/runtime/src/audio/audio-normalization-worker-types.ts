import type { AudioAnalysis } from '@beam/engine/shared/audio-normalization-types';
import type { MediaSourceDescriptor } from '@beam/runtime/shared/media-types';

export type AudioNormalizationWorkerRequest = {
  type: 'analyze';
  requestId: string;
  source: MediaSourceDescriptor;
  rangeStartMs: number;
  rangeDurationMs: number;
  analysisKey: string;
};

export type AudioNormalizationWorkerResponse =
  | { type: 'result'; requestId: string; analysis: AudioAnalysis }
  | { type: 'error'; requestId: string; message: string };
