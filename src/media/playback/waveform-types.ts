import type { MediaError, MediaSourceDescriptor } from '../shared';

export interface WaveformExtractionProgress {
  pointOffset: number;
  peaks: Float32Array;
  bands: Float32Array;
  complete: boolean;
}

export interface WaveformExtractionOptions {
  pointsPerChunk: number;
  shouldStop: () => boolean;
  onProgress: (progress: WaveformExtractionProgress) => void;
}

export interface WaveformFilter {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
  z1: number;
  z2: number;
}

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
      bands: Float32Array;
      segmentIndex: number;
      segmentCount: number;
      segmentPointOffset: number;
      segmentComplete: boolean;
    }
  | { type: 'error'; generation: number; clipId: string; error: MediaError };
