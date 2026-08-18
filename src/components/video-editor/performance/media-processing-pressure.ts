import { inject, readonly, ref, type InjectionKey, type Ref } from 'vue';

export type MediaProcessingKind = 'thumbnails' | 'waveforms';

export interface MediaProcessingMetrics {
  activeJobs: number;
  pendingJobs: number;
  capacity: number;
  errorCount: number;
  oldestJobAgeMs: number;
}

export interface MediaProcessingReporter {
  update(activeJobs: number, pendingJobs: number): void;
  error(): void;
  dispose(): void;
}

type ReporterState = MediaProcessingMetrics & { kind: MediaProcessingKind; activeSinceMs: number | null };

export interface MediaProcessingCollector {
  metrics: Readonly<Ref<MediaProcessingMetrics>>;
  reporter(kind: MediaProcessingKind, capacity: number): MediaProcessingReporter;
}

export const MEDIA_PROCESSING_COLLECTOR: InjectionKey<MediaProcessingCollector> = Symbol('media-processing-collector');

const emptyMetrics = (): MediaProcessingMetrics => ({
  activeJobs: 0,
  pendingJobs: 0,
  capacity: 0,
  errorCount: 0,
  oldestJobAgeMs: 0,
});

export function createMediaProcessingCollector(now: () => number = () => performance.now()): MediaProcessingCollector {
  const metrics = ref<MediaProcessingMetrics>(emptyMetrics());
  const reporters = new Map<symbol, ReporterState>();

  const publish = () => {
    const timestamp = now();
    let oldestJobAgeMs = 0;
    const next = [...reporters.values()].reduce<MediaProcessingMetrics>((total, state) => {
      total.activeJobs += state.activeJobs;
      total.pendingJobs += state.pendingJobs;
      if (state.activeJobs > 0 || state.pendingJobs > 0) total.capacity += state.capacity;
      total.errorCount += state.errorCount;
      if (state.activeSinceMs !== null) oldestJobAgeMs = Math.max(oldestJobAgeMs, timestamp - state.activeSinceMs);
      return total;
    }, emptyMetrics());
    next.oldestJobAgeMs = Math.max(0, oldestJobAgeMs);
    metrics.value = next;
  };

  const reporter = (kind: MediaProcessingKind, capacity: number): MediaProcessingReporter => {
    const id = Symbol(kind);
    const state: ReporterState = {
      ...emptyMetrics(),
      kind,
      capacity: Math.max(1, Math.round(capacity)),
      activeSinceMs: null,
    };
    reporters.set(id, state);
    publish();
    return {
      update(activeJobs, pendingJobs) {
        state.activeJobs = Math.max(0, Math.round(activeJobs));
        state.pendingJobs = Math.max(0, Math.round(pendingJobs));
        const active = state.activeJobs > 0 || state.pendingJobs > 0;
        if (active && state.activeSinceMs === null) state.activeSinceMs = now();
        if (!active) state.activeSinceMs = null;
        publish();
      },
      error() {
        state.errorCount += 1;
        publish();
      },
      dispose() {
        reporters.delete(id);
        publish();
      },
    };
  };

  return { metrics: readonly(metrics), reporter };
}

export function useMediaProcessingReporter(kind: MediaProcessingKind, capacity: number): MediaProcessingReporter {
  const collector = inject(MEDIA_PROCESSING_COLLECTOR, null);
  return (
    collector?.reporter(kind, capacity) ?? {
      update() {},
      error() {},
      dispose() {},
    }
  );
}
