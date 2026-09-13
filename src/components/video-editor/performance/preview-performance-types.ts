import type { Ref } from 'vue';
import type { AudioPlaybackMetrics, PlaybackMetrics, PlaybackState } from '~/media/playback';
import type { MediaProcessingMetrics } from './media-processing-pressure';
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

export interface PreviewPerformanceMonitorOptions {
  isPlaying: Readonly<Ref<boolean>>;
  playbackState: Readonly<Ref<PlaybackState>>;
  previewQuality: Readonly<Ref<PreviewQuality>>;
  playbackMetrics: Readonly<Ref<PlaybackMetrics | null>>;
  audioMetrics: Readonly<Ref<AudioPlaybackMetrics | null>>;
  mediaMetrics: Readonly<Ref<MediaProcessingMetrics>>;
  isReady?: Readonly<Ref<boolean>>;
  now?: () => number;
}
