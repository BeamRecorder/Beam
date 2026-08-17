import type { PreviewQuality } from '~/media/playback';

export type PreviewPerformanceChannel = 'ui' | 'worker' | 'audio' | 'media';
export type PreviewPerformanceStatus = 'idle' | 'good' | 'warning' | 'critical';

export interface PreviewPerformanceScores {
  ui: number;
  worker: number;
  audio: number;
  media: number;
}

export interface PreviewPerformanceActivity {
  playback: boolean;
  media: boolean;
}

export interface PreviewPerformanceSample extends PreviewPerformanceScores {
  timestampMs: number;
}

export interface PreviewPerformanceSnapshot {
  status: PreviewPerformanceStatus;
  scores: PreviewPerformanceScores;
  activity: PreviewPerformanceActivity;
  samples: readonly PreviewPerformanceSample[];
  issues: readonly PreviewPerformanceChannel[];
  recommendation: Extract<PreviewQuality, 'half' | 'quarter'> | null;
}

export interface PreviewPerformanceHealthState {
  status: PreviewPerformanceStatus;
  badSamples: number;
  goodSamples: number;
}
