import { onScopeDispose, readonly, ref, watch, type Ref } from 'vue';
import type { AudioPlaybackMetrics, PlaybackMetrics, PlaybackState, PreviewQuality } from '~/media/playback';
import {
  clampPerformanceScore,
  idlePreviewPerformanceHealth,
  nextPreviewPerformanceHealth,
  previewPerformanceIssues,
  recommendedPreviewQuality,
} from './preview-performance-health';
import type {
  PreviewPerformanceHealthState,
  PreviewPerformanceScores,
  PreviewPerformanceSnapshot,
} from './preview-performance-types';
import type { MediaProcessingMetrics } from './media-processing-pressure';

const SAMPLE_INTERVAL_MS = 500;
const STARTUP_COOLDOWN_MS = 1_000;
const INITIAL_WARMUP_MS = 1_500;
const MAX_SAMPLES = 48;

type MonitorOptions = {
  isPlaying: Readonly<Ref<boolean>>;
  playbackState: Readonly<Ref<PlaybackState>>;
  previewQuality: Readonly<Ref<PreviewQuality>>;
  playbackMetrics: Readonly<Ref<PlaybackMetrics | null>>;
  audioMetrics: Readonly<Ref<AudioPlaybackMetrics | null>>;
  mediaMetrics: Readonly<Ref<MediaProcessingMetrics>>;
  isReady?: Readonly<Ref<boolean>>;
  now?: () => number;
};

const percentile = (values: readonly number[], ratio: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))] ?? 0;
};

export function uiPerformanceScore(frameIntervals: readonly number[]) {
  if (frameIntervals.length < 2) return 0;
  const p95 = percentile(frameIntervals, 0.95);
  const longFrameRatio = frameIntervals.filter((duration) => duration >= 50).length / frameIntervals.length;
  return clampPerformanceScore(Math.max((p95 - 22) / 40, longFrameRatio / 0.2));
}

export function workerPerformanceScore(current: PlaybackMetrics | null, previous: PlaybackMetrics | null) {
  if (!current || !previous) return 0;
  const dropped = Math.max(0, current.droppedFrames - previous.droppedFrames);
  const presented = Math.max(0, current.presentedFrames - previous.presentedFrames);
  const dropRatio = dropped / Math.max(1, dropped + presented);
  const dropScore = (dropRatio - 0.05) / 0.2;
  const queueScore = (current.queueSize - 2) / 4;
  return clampPerformanceScore(Math.max(dropScore, queueScore));
}

export function audioPerformanceScore(current: AudioPlaybackMetrics | null, previous: AudioPlaybackMetrics | null) {
  if (!current || !previous) return 0;
  if (current.contextState === 'suspended' || current.contextState === 'interrupted') return 1;
  const errors = Math.max(0, current.scheduleErrors - previous.scheduleErrors);
  if (errors > 0) return 1;
  const late = Math.max(0, current.lateBuffers - previous.lateBuffers);
  const scheduled = Math.max(0, current.scheduledBuffers - previous.scheduledBuffers);
  return clampPerformanceScore((late / Math.max(1, late + scheduled) - 0.03) / 0.17);
}

export function mediaPerformanceScore(current: MediaProcessingMetrics, previous: MediaProcessingMetrics | null) {
  if (current.activeJobs <= 0 && current.pendingJobs <= 0) return 0;
  const capacity = Math.max(1, current.capacity);
  const activeScore = current.activeJobs / capacity;
  const backlogScore = current.pendingJobs / (capacity * 3);
  const ageScore = (current.oldestJobAgeMs - 250) / 1_750;
  const errorScore = previous && current.errorCount > previous.errorCount ? 1 : 0;
  return clampPerformanceScore(Math.max(activeScore * 0.55 + backlogScore * 0.45, ageScore, errorScore));
}

export function usePreviewPerformanceMonitor(options: MonitorOptions) {
  const now = options.now ?? (() => performance.now());
  const snapshot = ref<PreviewPerformanceSnapshot>({
    status: 'idle',
    scores: { ui: 0, worker: 0, audio: 0, media: 0 },
    activity: { playback: false, media: false },
    samples: [],
    issues: [],
    recommendation: null,
  });
  let health: PreviewPerformanceHealthState = idlePreviewPerformanceHealth();
  let previousPlaybackMetrics: PlaybackMetrics | null = null;
  let previousAudioMetrics: AudioPlaybackMetrics | null = null;
  let previousMediaMetrics: MediaProcessingMetrics | null = null;
  let frameIntervals: number[] = [];
  let previousFrameTime: number | null = null;
  let animationFrame: number | null = null;
  let sampleTimer: ReturnType<typeof setInterval> | null = null;
  let cooldownUntil = 0;
  let startupCooldownUntil = 0;

  const playbackActive = () => options.isPlaying.value && options.playbackState.value === 'playing';
  const isReady = () => (options.isReady ? options.isReady.value : true);
  const resetBaselines = () => {
    previousPlaybackMetrics = options.playbackMetrics.value;
    previousAudioMetrics = options.audioMetrics.value;
    previousMediaMetrics = options.mediaMetrics.value;
  };
  const stop = () => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    if (sampleTimer) clearInterval(sampleTimer);
    animationFrame = null;
    sampleTimer = null;
  };
  const trackFrame = (timestamp: number) => {
    if (typeof document === 'undefined' || !document.hidden) {
      if (previousFrameTime !== null) frameIntervals.push(Math.max(0, timestamp - previousFrameTime));
    }
    previousFrameTime = timestamp;
    animationFrame = requestAnimationFrame(trackFrame);
  };
  const sample = () => {
    const timestampMs = now();
    if ((typeof document !== 'undefined' && document.hidden) || !isReady() || timestampMs < startupCooldownUntil) {
      frameIntervals = [];
      previousFrameTime = null;
      resetBaselines();
      return;
    }
    const currentPlayback = options.playbackMetrics.value;
    const currentAudio = options.audioMetrics.value;
    const currentMedia = options.mediaMetrics.value;
    const isPlaybackActive = playbackActive();
    const mediaActive = currentMedia.activeJobs > 0 || currentMedia.pendingJobs > 0;
    const playbackReady = isPlaybackActive && timestampMs >= cooldownUntil;
    const scores: PreviewPerformanceScores = {
      ui: uiPerformanceScore(frameIntervals),
      worker: playbackReady ? workerPerformanceScore(currentPlayback, previousPlaybackMetrics) : 0,
      audio: playbackReady ? audioPerformanceScore(currentAudio, previousAudioMetrics) : 0,
      media: mediaActive ? mediaPerformanceScore(currentMedia, previousMediaMetrics) : 0,
    };
    frameIntervals = [];
    previousPlaybackMetrics = currentPlayback;
    previousAudioMetrics = currentAudio;
    previousMediaMetrics = currentMedia;
    health = nextPreviewPerformanceHealth(health, scores);
    const samples = [...snapshot.value.samples, { timestampMs, ...scores }].slice(-MAX_SAMPLES);
    snapshot.value = {
      status: health.status,
      scores,
      activity: { playback: isPlaybackActive, media: mediaActive },
      samples,
      issues: previewPerformanceIssues(scores),
      recommendation: recommendedPreviewQuality(health.status, options.previewQuality.value),
    };
  };
  if (options.isReady) {
    watch(options.isReady, (ready) => {
      if (ready) {
        startupCooldownUntil = now() + 1_000;
        resetBaselines();
        frameIntervals = [];
      }
    });
  }
  watch(
    () => [options.isPlaying.value, options.playbackState.value] as const,
    () => {
      resetBaselines();
      cooldownUntil = playbackActive() ? now() + STARTUP_COOLDOWN_MS : 0;
      snapshot.value = {
        ...snapshot.value,
        scores: { ...snapshot.value.scores, worker: 0, audio: 0 },
        activity: { ...snapshot.value.activity, playback: playbackActive() },
        recommendation: null,
      };
    },
    { immediate: true },
  );
  watch(options.previewQuality, () => {
    health = { status: 'good', badSamples: 0, goodSamples: 0 };
    resetBaselines();
    cooldownUntil = playbackActive() ? now() + STARTUP_COOLDOWN_MS : 0;
    snapshot.value = { ...snapshot.value, status: 'good', issues: [], recommendation: null };
  });
  health = { status: 'good', badSamples: 0, goodSamples: 0 };
  snapshot.value = { ...snapshot.value, status: 'good' };
  animationFrame = requestAnimationFrame(trackFrame);
  sampleTimer = setInterval(sample, SAMPLE_INTERVAL_MS);
  onScopeDispose(stop);
  return { snapshot: readonly(snapshot) };
}
