import type { EngineMetricsSnapshot } from '@beam/runtime/performance/engine-metrics-types';
export type VideoPipelineStats = {
  engine?: EngineMetricsSnapshot;
  elapsedMs: number;
  decodeMs: number;
  renderMs: number;
  encoderBackpressureMs: number;
};

export interface VideoFrameWriter {
  addVideo(timestamp: number, duration: number): Promise<void>;
  closeVideo(): void;
}
export interface ExportFrameRange {
  first: number;
  end: number;
}
