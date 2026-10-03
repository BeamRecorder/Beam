import type {
  EngineCounter,
  EngineMetricsOptions,
  EngineMetricsSnapshot,
  EngineStage,
  EngineStageBuffer,
} from '@beam/runtime/performance/engine-metrics-types';

const noop = () => {};

/** Bounded measurements of real work; owns no interval, animation frame or logger. */
export class EngineMetrics {
  private enabled: boolean;
  private readonly capacity: number;
  private readonly now: () => number;
  private stages = new Map<EngineStage, EngineStageBuffer>();
  private counters = new Map<EngineCounter, number>();
  private revision = 0;

  constructor(options: EngineMetricsOptions = {}) {
    this.capacity = options.capacity ?? 120;
    if (!Number.isSafeInteger(this.capacity) || this.capacity < 1 || this.capacity > 2048)
      throw new RangeError('Invalid metrics capacity.');
    this.enabled = options.enabled ?? false;
    this.now = options.now ?? (() => performance.now());
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.revision += 1;
  }

  begin(stage: EngineStage): () => void {
    if (!this.enabled) return noop;
    const start = this.now(),
      revision = this.revision;
    let ended = false;
    return () => {
      if (ended || revision !== this.revision) return;
      ended = true;
      this.observe(stage, Math.max(0, this.now() - start));
    };
  }

  measure<T>(stage: EngineStage, work: () => T): T {
    const end = this.begin(stage);
    try {
      return work();
    } finally {
      end();
    }
  }

  async measureAsync<T>(stage: EngineStage, work: () => Promise<T>): Promise<T> {
    const end = this.begin(stage);
    try {
      return await work();
    } finally {
      end();
    }
  }

  observe(stage: EngineStage, durationMs: number): void {
    if (!this.enabled) return;
    if (!Number.isFinite(durationMs) || durationMs < 0) throw new RangeError('Invalid engine duration.');
    let buffer = this.stages.get(stage);
    if (!buffer) {
      buffer = { values: new Float64Array(this.capacity), count: 0, totalMs: 0, latestMs: 0 };
      this.stages.set(stage, buffer);
    }
    buffer.values[buffer.count % this.capacity] = durationMs;
    buffer.count += 1;
    buffer.totalMs += durationMs;
    buffer.latestMs = durationMs;
  }

  count(counter: EngineCounter, increment = 1): void {
    if (!this.enabled) return;
    if (!Number.isSafeInteger(increment) || increment < 0) throw new RangeError('Invalid engine counter increment.');
    this.counters.set(counter, (this.counters.get(counter) ?? 0) + increment);
  }

  snapshot(): EngineMetricsSnapshot {
    const stages: EngineMetricsSnapshot['stages'] = {};
    for (const [stage, buffer] of this.stages) {
      const values = [...buffer.values.subarray(0, Math.min(buffer.count, this.capacity))].sort((a, b) => a - b);
      stages[stage] = {
        count: buffer.count,
        totalMs: buffer.totalMs,
        latestMs: buffer.latestMs,
        medianMs: values[Math.floor(values.length * 0.5)]!,
        p95Ms: values[Math.min(values.length - 1, Math.floor(values.length * 0.95))]!,
        maxMs: values.at(-1)!,
        windowSamples: values.length,
      };
    }
    return {
      schemaVersion: 1,
      enabled: this.enabled,
      capacity: this.capacity,
      stages,
      counters: Object.fromEntries(this.counters),
    };
  }

  reset(): void {
    this.revision += 1;
    this.stages.clear();
    this.counters.clear();
  }
}

// Each JS realm owns its collector; worker reports serialize snapshots, never share mutable buffers.
export const engineMetrics = new EngineMetrics({ enabled: true });
