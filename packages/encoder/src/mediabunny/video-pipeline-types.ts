import type { EngineMetricsSnapshot } from '@beam/runtime/performance/engine-metrics-types';
export type VideoPipelineStats = {
  engine?: EngineMetricsSnapshot;
  elapsedMs: number;
  decodeMs: number;
  renderMs: number;
  encoderBackpressureMs: number;
};

export interface VideoFrameWriter {
  prepareVideo?(sequence: number): Promise<void>;
  addVideo(timestamp: number, duration: number): Promise<void>;
  closeVideo(): void;
}
export interface AudioFrameWriter {
  addAudio(sample: import('mediabunny').AudioSample): Promise<void>;
  closeAudio(): void;
}
export interface ExportFrameRange {
  first: number;
  end: number;
}
