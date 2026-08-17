import { describe, expect, it } from 'vitest';
import type { AudioPlaybackMetrics, PlaybackMetrics } from '~/media/playback';
import {
  clampPerformanceScore,
  nextPreviewPerformanceHealth,
  previewPerformanceIssues,
  recommendedPreviewQuality,
} from '../preview-performance-health';
import {
  audioPerformanceScore,
  mediaPerformanceScore,
  uiPerformanceScore,
  workerPerformanceScore,
} from '../usePreviewPerformanceMonitor';
import type { PreviewPerformanceHealthState, PreviewPerformanceScores } from '../preview-performance-types';
import type { MediaProcessingMetrics } from '../media-processing-pressure';

const playbackMetrics = (overrides: Partial<PlaybackMetrics> = {}): PlaybackMetrics => ({
  decodedFrames: 0,
  presentedFrames: 0,
  droppedFrames: 0,
  supersededRequests: 0,
  queueSize: 0,
  cacheBytes: 0,
  disposedBitmaps: 0,
  seekLatencyMs: [],
  ...overrides,
});

const audioMetrics = (overrides: Partial<AudioPlaybackMetrics> = {}): AudioPlaybackMetrics => ({
  schedulePasses: 0,
  scheduledBuffers: 0,
  lateBuffers: 0,
  scheduleErrors: 0,
  maxLatenessMs: 0,
  contextState: 'running',
  ...overrides,
});

const mediaMetrics = (overrides: Partial<MediaProcessingMetrics> = {}): MediaProcessingMetrics => ({
  activeJobs: 0,
  pendingJobs: 0,
  capacity: 1,
  errorCount: 0,
  oldestJobAgeMs: 0,
  ...overrides,
});

const health = (overrides: Partial<PreviewPerformanceHealthState> = {}): PreviewPerformanceHealthState => ({
  status: 'good',
  badSamples: 0,
  goodSamples: 0,
  ...overrides,
});

describe('preview performance score functions', () => {
  it('scores long UI frames and keeps ordinary frame intervals healthy', () => {
    expect(uiPerformanceScore([16, 16.2, 16.5, 16.6])).toBe(0);
    expect(uiPerformanceScore([16, 17, 18, 19])).toBeLessThan(0.15);
    expect(uiPerformanceScore([40, 42, 45, 50])).toBeGreaterThan(0.5);
    expect(uiPerformanceScore([])).toBe(0);
    expect(uiPerformanceScore([16])).toBe(0);
  });

  it('scores worker drops and queue pressure from metric deltas', () => {
    const previous = playbackMetrics({ presentedFrames: 10, droppedFrames: 0 });
    expect(workerPerformanceScore(playbackMetrics({ presentedFrames: 20, droppedFrames: 0 }), previous)).toBe(0);
    expect(
      workerPerformanceScore(playbackMetrics({ presentedFrames: 11, droppedFrames: 10, queueSize: 8 }), previous),
    ).toBe(1);
    expect(workerPerformanceScore(null, previous)).toBe(0);
  });

  it('scores suspended/erroring audio and late buffer pressure', () => {
    const previous = audioMetrics({ scheduledBuffers: 10, lateBuffers: 0 });
    expect(audioPerformanceScore(audioMetrics({ scheduledBuffers: 20, lateBuffers: 0 }), previous)).toBe(0);
    expect(audioPerformanceScore(audioMetrics({ scheduledBuffers: 11, lateBuffers: 10 }), previous)).toBeGreaterThan(
      0.5,
    );
    expect(audioPerformanceScore(audioMetrics({ contextState: 'suspended' }), previous)).toBe(1);
    expect(audioPerformanceScore(audioMetrics({ scheduleErrors: 1 }), previous)).toBe(1);
    expect(audioPerformanceScore(null, previous)).toBe(0);
  });

  it('clamps invalid, infinite, and out-of-range scores safely', () => {
    expect(clampPerformanceScore(-1)).toBe(0);
    expect(clampPerformanceScore(2)).toBe(1);
    expect(clampPerformanceScore(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampPerformanceScore(Number.NaN)).toBe(0);
    expect(uiPerformanceScore([Number.NaN, Number.POSITIVE_INFINITY])).toBe(0);
    expect(
      workerPerformanceScore(
        playbackMetrics({ presentedFrames: Number.NaN, droppedFrames: Number.POSITIVE_INFINITY }),
        playbackMetrics(),
      ),
    ).toBe(0);
    expect(audioPerformanceScore(audioMetrics({ lateBuffers: Number.NaN }), audioMetrics())).toBe(0);
  });
});

describe('preview performance health hysteresis', () => {
  const badScores: PreviewPerformanceScores = { ui: 0.8, worker: 0, audio: 0, media: 0 };
  const goodScores: PreviewPerformanceScores = { ui: 0.1, worker: 0.1, audio: 0.1, media: 0.1 };

  it('requires four bad samples for warning and eight for critical', () => {
    let state = health();
    for (let index = 0; index < 3; index += 1) state = nextPreviewPerformanceHealth(state, badScores);
    expect(state).toMatchObject({ status: 'good', badSamples: 3 });
    state = nextPreviewPerformanceHealth(state, badScores);
    expect(state).toMatchObject({ status: 'warning', badSamples: 4 });
    for (let index = 0; index < 3; index += 1) state = nextPreviewPerformanceHealth(state, badScores);
    expect(state.status).toBe('warning');
    state = nextPreviewPerformanceHealth(state, badScores);
    expect(state).toMatchObject({ status: 'critical', badSamples: 8 });
  });

  it('requires four healthy samples to recover and resets counters in the middle band', () => {
    let state = health({ status: 'critical', badSamples: 8 });
    state = nextPreviewPerformanceHealth(state, { ui: 0.4, worker: 0, audio: 0, media: 0 });
    expect(state).toMatchObject({ status: 'critical', badSamples: 0, goodSamples: 0 });
    for (let index = 0; index < 3; index += 1) state = nextPreviewPerformanceHealth(state, goodScores);
    expect(state.status).toBe('critical');
    state = nextPreviewPerformanceHealth(state, goodScores);
    expect(state).toMatchObject({ status: 'good', goodSamples: 4, badSamples: 0 });
  });

  it('reports only channels at or above the warning threshold', () => {
    expect(previewPerformanceIssues({ ui: 0.55, worker: 0.54, audio: 1 })).toEqual(['ui', 'audio']);
    expect(previewPerformanceIssues({ ui: Number.NaN, worker: 0, audio: 0 })).toEqual([]);
  });
});

describe('media processing pressure score', () => {
  it('scores active capacity, backlog age, and new processing errors', () => {
    const previous = mediaMetrics({ activeJobs: 0 });
    expect(mediaPerformanceScore(mediaMetrics(), previous)).toBe(0);
    expect(mediaPerformanceScore(mediaMetrics({ activeJobs: 1, capacity: 1 }), previous)).toBeGreaterThan(0.5);
    expect(mediaPerformanceScore(mediaMetrics({ pendingJobs: 6, capacity: 1 }), previous)).toBeCloseTo(0.9);
    expect(mediaPerformanceScore(mediaMetrics({ activeJobs: 1, capacity: 1, oldestJobAgeMs: 2_000 }), previous)).toBe(
      1,
    );
    expect(mediaPerformanceScore(mediaMetrics({ errorCount: 1 }), previous)).toBe(0);
    expect(mediaPerformanceScore(mediaMetrics({ activeJobs: 1, errorCount: 1 }), previous)).toBe(1);
  });
});

describe('preview quality recommendations', () => {
  it.each([
    ['critical', 'full', 'half'],
    ['warning', 'half', 'quarter'],
    ['critical', 'half', 'quarter'],
  ] as const)('recommends %s quality from %s at %s severity', (status, quality, expected) => {
    expect(recommendedPreviewQuality(status, quality)).toBe(expected);
  });

  it('does not recommend a change when healthy or already at quarter quality', () => {
    expect(recommendedPreviewQuality('good', 'full')).toBeNull();
    expect(recommendedPreviewQuality('idle', 'full')).toBeNull();
    expect(recommendedPreviewQuality('critical', 'quarter')).toBeNull();
  });
});
