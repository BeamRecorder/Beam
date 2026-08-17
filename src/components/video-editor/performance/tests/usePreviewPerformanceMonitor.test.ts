import { effectScope, ref, type Ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPlaybackMetrics, PlaybackMetrics, PlaybackState, PreviewQuality } from '~/media/playback';
import { usePreviewPerformanceMonitor } from '../usePreviewPerformanceMonitor';
import type { MediaProcessingMetrics } from '../media-processing-pressure';

type MonitorInputs = {
  isPlaying: Ref<boolean>;
  playbackState: Ref<PlaybackState>;
  previewQuality: Ref<PreviewQuality>;
  playbackMetrics: Ref<PlaybackMetrics | null>;
  audioMetrics: Ref<AudioPlaybackMetrics | null>;
  mediaMetrics: Ref<MediaProcessingMetrics>;
};

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
  capacity: 0,
  errorCount: 0,
  oldestJobAgeMs: 0,
  ...overrides,
});

const createInputs = (quality: PreviewQuality = 'full'): MonitorInputs => ({
  isPlaying: ref(true),
  playbackState: ref('playing'),
  previewQuality: ref(quality),
  playbackMetrics: ref(playbackMetrics()),
  audioMetrics: ref(audioMetrics()),
  mediaMetrics: ref(mediaMetrics()),
});

describe('usePreviewPerformanceMonitor', () => {
  let callbacks: Array<(timestamp: number) => void>;
  let nextAnimationFrameId: number;
  let clock: number;

  beforeEach(() => {
    vi.useFakeTimers();
    callbacks = [];
    nextAnimationFrameId = 0;
    clock = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void) => {
      callbacks.push(callback);
      nextAnimationFrameId += 1;
      return nextAnimationFrameId;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const tickFrame = (timestamp: number) => {
    const callback = callbacks.shift();
    expect(callback).toBeDefined();
    callback?.(timestamp);
  };

  const sample = (inputs: MonitorInputs, metrics: PlaybackMetrics, audio = audioMetrics()) => {
    inputs.playbackMetrics.value = metrics;
    inputs.audioMetrics.value = audio;
    inputs.mediaMetrics.value = mediaMetrics();
    clock += 500;
    vi.advanceTimersByTime(500);
  };

  const activateAfterCooldown = () => {
    clock = 1_100;
    vi.advanceTimersByTime(500);
  };

  it('keeps the UI/media monitor active while playback scores stay disabled when paused', () => {
    const inputs = createInputs();
    inputs.isPlaying.value = false;
    inputs.playbackState.value = 'paused';
    inputs.mediaMetrics.value = mediaMetrics({ activeJobs: 1, capacity: 1 });
    const scope = effectScope();
    const monitor = scope.run(() => usePreviewPerformanceMonitor({ ...inputs, now: () => clock }))!;

    tickFrame(0);
    tickFrame(16);
    clock += 500;
    vi.advanceTimersByTime(500);

    expect(monitor.snapshot.value).toMatchObject({
      status: 'good',
      activity: { playback: false, media: true },
      scores: { worker: 0, audio: 0 },
      recommendation: null,
    });
    expect(monitor.snapshot.value.samples).toHaveLength(1);
    scope.stop();
  });

  it('ignores bad metrics during startup cooldown, then establishes a fresh baseline', () => {
    const inputs = createInputs();
    const scope = effectScope();
    const monitor = scope.run(() => usePreviewPerformanceMonitor({ ...inputs, now: () => clock }))!;

    inputs.playbackMetrics.value = playbackMetrics({ presentedFrames: 1, droppedFrames: 50, queueSize: 20 });
    inputs.audioMetrics.value = audioMetrics({ scheduleErrors: 1 });
    vi.advanceTimersByTime(500);
    expect(monitor.snapshot.value.samples).toHaveLength(1);
    expect(monitor.snapshot.value.scores).toMatchObject({ worker: 0, audio: 0 });

    activateAfterCooldown();
    expect(monitor.snapshot.value).toMatchObject({ status: 'good', recommendation: null });
    expect(monitor.snapshot.value.samples).toHaveLength(2);
    scope.stop();
  });

  it('escalates from warning to critical and recommends half then quarter quality', () => {
    const inputs = createInputs('full');
    const scope = effectScope();
    const monitor = scope.run(() => usePreviewPerformanceMonitor({ ...inputs, now: () => clock }))!;
    activateAfterCooldown();

    for (let index = 1; index <= 3; index += 1) {
      sample(
        inputs,
        playbackMetrics({ presentedFrames: index, droppedFrames: index * 10, queueSize: 8 }),
        audioMetrics(),
      );
    }
    expect(monitor.snapshot.value.status).toBe('good');

    sample(inputs, playbackMetrics({ presentedFrames: 4, droppedFrames: 40, queueSize: 8 }));
    expect(monitor.snapshot.value).toMatchObject({ status: 'warning', recommendation: 'half' });

    for (let index = 5; index <= 7; index += 1)
      sample(inputs, playbackMetrics({ presentedFrames: index, droppedFrames: index * 10, queueSize: 8 }));
    expect(monitor.snapshot.value).toMatchObject({ status: 'warning', recommendation: 'half' });

    sample(inputs, playbackMetrics({ presentedFrames: 8, droppedFrames: 80, queueSize: 8 }));
    expect(monitor.snapshot.value).toMatchObject({ status: 'critical', recommendation: 'half' });
    scope.stop();
  });

  it('resets health, baselines, and recommendation when preview quality changes', async () => {
    const inputs = createInputs('full');
    const scope = effectScope();
    const monitor = scope.run(() => usePreviewPerformanceMonitor({ ...inputs, now: () => clock }))!;
    activateAfterCooldown();
    for (let index = 1; index <= 4; index += 1)
      sample(inputs, playbackMetrics({ presentedFrames: index, droppedFrames: index * 10, queueSize: 8 }));
    expect(monitor.snapshot.value.recommendation).toBe('half');

    inputs.previewQuality.value = 'half';
    await Promise.resolve();
    expect(monitor.snapshot.value).toMatchObject({ status: 'good', issues: [], recommendation: null });

    clock += 1_100;
    vi.advanceTimersByTime(500);
    sample(inputs, playbackMetrics({ presentedFrames: 100, droppedFrames: 1000, queueSize: 8 }));
    expect(monitor.snapshot.value.status).toBe('good');
    scope.stop();
  });

  it('recommends quarter after a warning while already using half quality', () => {
    const inputs = createInputs('half');
    const scope = effectScope();
    const monitor = scope.run(() => usePreviewPerformanceMonitor({ ...inputs, now: () => clock }))!;
    activateAfterCooldown();
    for (let index = 1; index <= 4; index += 1)
      sample(inputs, playbackMetrics({ presentedFrames: index, droppedFrames: index * 10, queueSize: 8 }));
    expect(monitor.snapshot.value).toMatchObject({ status: 'warning', recommendation: 'quarter' });
    scope.stop();
  });

  it('recovers only after four healthy samples and clears issues/recommendation', () => {
    const inputs = createInputs('half');
    const scope = effectScope();
    const monitor = scope.run(() => usePreviewPerformanceMonitor({ ...inputs, now: () => clock }))!;
    activateAfterCooldown();
    for (let index = 1; index <= 9; index += 1)
      sample(inputs, playbackMetrics({ presentedFrames: index, droppedFrames: index * 10, queueSize: 8 }));
    expect(monitor.snapshot.value.status).toBe('critical');

    for (let index = 1; index <= 3; index += 1)
      sample(inputs, playbackMetrics({ presentedFrames: 100 + index, droppedFrames: 90, queueSize: 0 }));
    expect(monitor.snapshot.value.status).toBe('critical');
    sample(inputs, playbackMetrics({ presentedFrames: 104, droppedFrames: 90, queueSize: 0 }));
    expect(monitor.snapshot.value).toMatchObject({ status: 'good', issues: [], recommendation: null });
    scope.stop();
  });

  it('keeps the UI monitor active when paused and cleans up only on disposal', async () => {
    const inputs = createInputs();
    const cancel = vi.mocked(cancelAnimationFrame);
    const scope = effectScope();
    const monitor = scope.run(() => usePreviewPerformanceMonitor({ ...inputs, now: () => clock }))!;
    expect(callbacks).toHaveLength(1);

    inputs.isPlaying.value = false;
    await Promise.resolve();
    expect(cancel).not.toHaveBeenCalled();
    const sampleCount = monitor.snapshot.value.samples.length;
    clock += 500;
    vi.advanceTimersByTime(500);
    expect(monitor.snapshot.value.samples.length).toBeGreaterThan(sampleCount);

    scope.stop();
    expect(cancel).toHaveBeenCalled();
  });

  it('tracks UI frame intervals without allowing a single startup frame to create a warning', () => {
    const inputs = createInputs();
    const scope = effectScope();
    const monitor = scope.run(() => usePreviewPerformanceMonitor({ ...inputs, now: () => clock }))!;
    tickFrame(0);
    tickFrame(16);
    tickFrame(32);
    activateAfterCooldown();
    expect(monitor.snapshot.value.scores.ui).toBe(0);
    scope.stop();
  });

  it('pauses recording metrics until isReady becomes true', async () => {
    const inputs = createInputs();
    const isReady = ref(false);
    const scope = effectScope();
    const monitor = scope.run(() => usePreviewPerformanceMonitor({ ...inputs, isReady, now: () => clock }))!;

    inputs.mediaMetrics.value = mediaMetrics({ activeJobs: 5, pendingJobs: 10, capacity: 2 });
    clock += 500;
    vi.advanceTimersByTime(500);

    expect(monitor.snapshot.value.samples).toHaveLength(0);
    expect(monitor.snapshot.value.status).toBe('good');

    isReady.value = true;
    await Promise.resolve();

    clock += 1_500;
    vi.advanceTimersByTime(1_500);

    expect(monitor.snapshot.value.samples.length).toBeGreaterThan(0);
    scope.stop();
  });
});
