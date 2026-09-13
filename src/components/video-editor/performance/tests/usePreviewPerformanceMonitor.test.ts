import { effectScope, ref, type Ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPlaybackMetrics, PlaybackMetrics, PlaybackState, PreviewQuality } from '~/media/playback';
import {
  audioPerformanceScore,
  mediaPerformanceScore,
  uiPerformanceScore,
  usePreviewPerformanceMonitor,
  workerPerformanceScore,
} from '../usePreviewPerformanceMonitor';
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
  let callbacks: Map<number, (timestamp: number) => void>;
  let nextAnimationFrameId: number;
  let clock: number;
  let originalHidden: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    callbacks = new Map();
    nextAnimationFrameId = 0;
    clock = 0;
    originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void) => {
      const id = ++nextAnimationFrameId;
      callbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        callbacks.delete(id);
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden);
    else Reflect.deleteProperty(document, 'hidden');
  });

  const tickFrame = (timestamp: number) => {
    const next = callbacks.entries().next();
    expect(next.done).toBe(false);
    if (next.done) return;
    const [id, callback] = next.value;
    callbacks.delete(id);
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

  it('returns neutral scores without a baseline or active media work', () => {
    const playback = playbackMetrics();
    const audio = audioMetrics();

    expect(uiPerformanceScore([])).toBe(0);
    expect(uiPerformanceScore([16])).toBe(0);
    expect(workerPerformanceScore(null, playback)).toBe(0);
    expect(workerPerformanceScore(playback, null)).toBe(0);
    expect(workerPerformanceScore(playback, playback)).toBe(0);
    expect(audioPerformanceScore(null, audio)).toBe(0);
    expect(audioPerformanceScore(audio, null)).toBe(0);
    expect(mediaPerformanceScore(mediaMetrics(), null)).toBe(0);
  });

  it('treats audio interruptions and newly reported errors as unhealthy', () => {
    const previousAudio = audioMetrics();
    expect(audioPerformanceScore(audioMetrics({ contextState: 'suspended' }), previousAudio)).toBe(1);
    expect(audioPerformanceScore(audioMetrics({ contextState: 'interrupted' }), previousAudio)).toBe(1);
    expect(audioPerformanceScore(audioMetrics({ scheduleErrors: 1 }), previousAudio)).toBe(1);
    expect(audioPerformanceScore(audioMetrics({ scheduleErrors: 0 }), audioMetrics({ scheduleErrors: 1 }))).toBe(0);
  });

  it('includes new media errors in the score while ignoring an unchanged error count', () => {
    const active = mediaMetrics({ pendingJobs: 1, capacity: 10, errorCount: 2 });
    expect(mediaPerformanceScore(active, mediaMetrics({ errorCount: 1 }))).toBe(1);
    expect(mediaPerformanceScore(active, mediaMetrics({ errorCount: 2 }))).toBeCloseTo(0.015);
    expect(mediaPerformanceScore(active, null)).toBeCloseTo(0.015);
  });

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

  it('sleeps while paused and idle, then resumes for media work and cleans up on disposal', async () => {
    const inputs = createInputs();
    const cancel = vi.mocked(cancelAnimationFrame);
    const scope = effectScope();
    const monitor = scope.run(() => usePreviewPerformanceMonitor({ ...inputs, now: () => clock }))!;
    expect(callbacks.size).toBe(1);

    inputs.isPlaying.value = false;
    inputs.playbackState.value = 'paused';
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
    expect(callbacks.size).toBe(0);
    const sampleCount = monitor.snapshot.value.samples.length;
    clock += 500;
    vi.advanceTimersByTime(500);
    expect(monitor.snapshot.value.samples.length).toBe(sampleCount);

    inputs.mediaMetrics.value = mediaMetrics({ activeJobs: 1, capacity: 1 });
    await Promise.resolve();
    expect(callbacks.size).toBe(1);
    tickFrame(600);
    expect(callbacks.size).toBe(1);

    inputs.mediaMetrics.value = mediaMetrics();
    await Promise.resolve();
    expect(callbacks.size).toBe(0);

    scope.stop();
    expect(cancel).toHaveBeenCalledTimes(2);
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

  it('waits through the post-ready cooldown before recording samples', async () => {
    const inputs = createInputs();
    const isReady = ref(false);
    const scope = effectScope();
    const monitor = scope.run(() => usePreviewPerformanceMonitor({ ...inputs, isReady, now: () => clock }))!;

    clock = 100;
    isReady.value = true;
    await Promise.resolve();
    clock = 600;
    vi.advanceTimersByTime(500);
    expect(monitor.snapshot.value.samples).toHaveLength(0);

    clock = 1_100;
    vi.advanceTimersByTime(500);
    expect(monitor.snapshot.value.samples).toHaveLength(1);
    isReady.value = false;
    await Promise.resolve();
    expect(monitor.snapshot.value.activity).toMatchObject({ playback: false, media: false });
    scope.stop();
  });

  it('uses the browser clock when no monitor clock is provided', () => {
    const inputs = createInputs();
    const scope = effectScope();
    const monitor = scope.run(() => usePreviewPerformanceMonitor(inputs))!;

    vi.advanceTimersByTime(1_500);
    expect(monitor.snapshot.value.samples.length).toBeGreaterThan(0);
    scope.stop();
  });

  it('skips hidden frame intervals and hidden timer samples without losing monitor cleanup', async () => {
    const inputs = createInputs();
    inputs.mediaMetrics.value = mediaMetrics({ activeJobs: 1, capacity: 1 });
    const scope = effectScope();
    const monitor = scope.run(() => usePreviewPerformanceMonitor({ ...inputs, now: () => clock }))!;

    tickFrame(0);
    tickFrame(16);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    tickFrame(100);
    clock = 500;
    vi.advanceTimersByTime(500);
    expect(monitor.snapshot.value.samples).toHaveLength(0);

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    scope.stop();
    expect(callbacks.size).toBe(0);
  });

  it('retains a final idle sample when active monitoring stops after sampling', async () => {
    const inputs = createInputs();
    const scope = effectScope();
    const monitor = scope.run(() => usePreviewPerformanceMonitor({ ...inputs, now: () => clock }))!;

    clock = 1_000;
    vi.advanceTimersByTime(500);
    expect(monitor.snapshot.value.samples).toHaveLength(1);

    inputs.isPlaying.value = false;
    inputs.playbackState.value = 'paused';
    await Promise.resolve();
    expect(monitor.snapshot.value.samples).toHaveLength(2);
    expect(monitor.snapshot.value.samples.at(-1)).toMatchObject({ ui: 0, worker: 0, audio: 0, media: 0 });
    scope.stop();
  });
});
