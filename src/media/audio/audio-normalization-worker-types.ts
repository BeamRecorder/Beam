import type { AudioAnalysis } from '../shared/audio-normalization-types';
import type { MediaSourceDescriptor } from '../shared/media-types';

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
