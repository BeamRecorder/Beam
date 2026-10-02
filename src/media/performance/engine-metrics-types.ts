export type EngineStage =
  | 'load'
  | 'seek'
  | 'decode'
  | 'prepare'
  | 'render'
  | 'gesture'
  | 'copy'
  | 'paste'
  | 'encode-wait'
  | 'gpu-upload'
  | 'gpu-submit'
  | 'gpu-execute';
export type EngineCounter = 'frames' | 'gpu-frames' | 'decoded' | 'dropped' | 'uploads' | 'draws';

export interface EngineStageSummary {
  count: number;
  totalMs: number;
  latestMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  windowSamples: number;
}

export interface EngineMetricsSnapshot {
  schemaVersion: 1;
  enabled: boolean;
  capacity: number;
  stages: Partial<Record<EngineStage, EngineStageSummary>>;
  counters: Partial<Record<EngineCounter, number>>;
}

export interface EngineMetricsOptions {
  enabled?: boolean;
  capacity?: number;
  now?: () => number;
}

export interface EngineStageBuffer {
  values: Float64Array;
  count: number;
  totalMs: number;
  latestMs: number;
}
