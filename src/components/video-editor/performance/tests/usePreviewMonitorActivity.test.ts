import { effectScope, ref, type Ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPlaybackMetrics, PlaybackMetrics, PlaybackState, PreviewQuality } from '~/media/playback';
import {
  beginPropertyInteraction,
  endPropertyInteraction,
  resetPropertyInteractions,
} from '~/composables/property-interaction';
import type { MediaProcessingMetrics } from '../media-processing-pressure';
import type { PreviewPerformanceMonitorOptions } from '../preview-performance-types';

const exportState = vi.hoisted(() => ({ isExporting: null as Ref<boolean> | null }));
let clock = 0;

vi.mock('~/components/export/useExportJob', () => ({
  useExportJob: () => ({ isExporting: exportState.isExporting }),
}));

import { usePreviewMonitorActivity } from '../usePreviewMonitorActivity';

const mediaMetrics = (overrides: Partial<MediaProcessingMetrics> = {}): MediaProcessingMetrics => ({
  activeJobs: 0,
  pendingJobs: 0,
  capacity: 0,
  errorCount: 0,
  oldestJobAgeMs: 0,
  ...overrides,
});

type MutableMonitorOptions = Omit<
  PreviewPerformanceMonitorOptions,
  'isPlaying' | 'playbackState' | 'previewQuality' | 'playbackMetrics' | 'audioMetrics' | 'mediaMetrics' | 'isReady'
> & {
  isPlaying: Ref<boolean>;
  playbackState: Ref<PlaybackState>;
  previewQuality: Ref<PreviewQuality>;
  playbackMetrics: Ref<PlaybackMetrics | null>;
  audioMetrics: Ref<AudioPlaybackMetrics | null>;
  mediaMetrics: Ref<MediaProcessingMetrics>;
  isReady: Ref<boolean>;
};

const createOptions = (): MutableMonitorOptions => ({
  isPlaying: ref(false),
  playbackState: ref<PlaybackState>('paused'),
  previewQuality: ref<PreviewQuality>('full'),
  playbackMetrics: ref<PlaybackMetrics | null>(null),
  audioMetrics: ref<AudioPlaybackMetrics | null>(null),
  mediaMetrics: ref(mediaMetrics()),
  isReady: ref(true),
  now: () => clock,
});

const createActivity = (options: PreviewPerformanceMonitorOptions) => {
  const scope = effectScope();
  const active = scope.run(() => usePreviewMonitorActivity(options));
  if (!active) throw new Error('Preview monitor activity was not created inside its scope.');
  return { scope, active };
};

const dispatch = (type: string, properties: Record<string, unknown> = {}) => {
  const event = new Event(type);
  for (const [key, value] of Object.entries(properties)) Object.defineProperty(event, key, { value });
  document.dispatchEvent(event);
};

describe('usePreviewMonitorActivity', () => {
  let originalHidden: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = 0;
    originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    exportState.isExporting = ref(false);
    resetPropertyInteractions();
  });

  afterEach(() => {
    resetPropertyInteractions();
    if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden);
    else Reflect.deleteProperty(document, 'hidden');
    vi.useRealTimers();
  });

  it('sleeps while paused and idle but stays active for playback, media, export, and property edits', () => {
    const options = createOptions();
    const { scope, active } = createActivity(options);
    expect(active.value).toBe(false);

    options.isPlaying.value = true;
    options.playbackState.value = 'playing';
    expect(active.value).toBe(true);
    options.isPlaying.value = false;
    options.playbackState.value = 'paused';
    expect(active.value).toBe(false);

    options.mediaMetrics.value = mediaMetrics({ activeJobs: 1, capacity: 1 });
    expect(active.value).toBe(true);
    options.mediaMetrics.value = mediaMetrics();
    expect(active.value).toBe(false);

    exportState.isExporting!.value = true;
    expect(active.value).toBe(true);
    exportState.isExporting!.value = false;
    expect(active.value).toBe(false);

    beginPropertyInteraction();
    expect(active.value).toBe(true);
    endPropertyInteraction();
    expect(active.value).toBe(false);
    scope.stop();
  });

  it('keeps input activity recent for one second after the last real input', () => {
    const { scope, active } = createActivity(createOptions());

    dispatch('pointermove', { buttons: 0 });
    expect(active.value).toBe(false);

    dispatch('pointermove', { buttons: 1 });
    expect(active.value).toBe(true);
    clock = 999;
    vi.advanceTimersByTime(999);
    dispatch('keydown');

    clock = 1_998;
    vi.advanceTimersByTime(1);
    expect(active.value).toBe(true);
    clock = 1_999;
    vi.advanceTimersByTime(1);
    expect(active.value).toBe(false);
    scope.stop();
  });

  it('uses the browser monotonic clock when no test clock is supplied', () => {
    const options = { ...createOptions(), now: undefined };
    const { scope, active } = createActivity(options);

    dispatch('keydown');
    expect(active.value).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(active.value).toBe(false);
    scope.stop();
  });

  it('stops activity when hidden or not ready and does not revive stale input on return', () => {
    const options = createOptions();
    const { scope, active } = createActivity(options);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    dispatch('visibilitychange');
    expect(active.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    dispatch('visibilitychange');
    dispatch('pointerdown');
    expect(active.value).toBe(true);
    expect(vi.getTimerCount()).toBe(1);

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    dispatch('visibilitychange');
    expect(active.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    clock = 5_000;
    vi.advanceTimersByTime(5_000);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    dispatch('visibilitychange');
    expect(active.value).toBe(false);

    options.mediaMetrics.value = mediaMetrics({ pendingJobs: 1, capacity: 1 });
    expect(active.value).toBe(true);
    options.isReady.value = false;
    expect(active.value).toBe(false);
    options.isReady.value = true;
    expect(active.value).toBe(true);
    scope.stop();
  });

  it('remains usable in a non-DOM scope and skips document listener cleanup', () => {
    vi.stubGlobal('document', undefined);
    try {
      const options = createOptions();
      options.isPlaying.value = true;
      options.playbackState.value = 'playing';
      const { scope, active } = createActivity(options);

      expect(active.value).toBe(true);
      scope.stop();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('clears settle timers and removes its listeners when the scope is disposed', () => {
    const { scope, active } = createActivity(createOptions());
    dispatch('keydown');
    expect(active.value).toBe(true);
    expect(vi.getTimerCount()).toBe(1);

    scope.stop();
    expect(vi.getTimerCount()).toBe(0);
    dispatch('pointerdown');
    expect(vi.getTimerCount()).toBe(0);
    expect(active.value).toBe(true);
  });
});
