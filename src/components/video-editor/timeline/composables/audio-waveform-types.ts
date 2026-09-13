import type { AudioClip, MediaAsset } from '~/media/shared/composition-types';

export interface AudioWaveformViewport {
  startSeconds: number;
  endSeconds: number;
  pixelsPerSecond: number;
}

export interface AudioWaveformSlice {
  bars: number[];
  bands: Float32Array;
  sourceDurationSeconds: number;
  leftPercent: number;
  widthPercent: number;
  loadingSegments: Array<{ leftPercent: number; widthPercent: number }>;
}

export type AudioWaveformStatus = 'idle' | 'loading' | 'ready' | 'error';

export type StoredWaveformSlice = AudioWaveformSlice & {
  sourceKey: string;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  peaks: Float32Array;
};

export type WaveformRequest = {
  clip: AudioClip;
  asset: MediaAsset | null;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  pointCount: number;
  leftPercent: number;
  widthPercent: number;
};

export type WaveformSegment = {
  index: number;
  count: number;
  pointOffset: number;
  pointCount: number;
  startSeconds: number;
  endSeconds: number;
};

export type RefinementBatch = {
  generation: number;
  request: WaveformRequest;
  peaks: Float32Array;
  bands: Float32Array;
  segments: WaveformSegment[];
  pending: Set<number>;
  receivedPoints: Map<number, number>;
};

export interface PreparedWaveform {
  peaks: Float32Array;
  bands: Float32Array;
  segments: WaveformSegment[];
  reusedPoints: number;
}
