import type { EngineMetricsSnapshot } from '@beam/runtime/performance/engine-metrics-types';

/** Text only, no paths, asset names or raw sample retention. Durations can overlap. */
export function formatEngineMetrics(snapshot: EngineMetricsSnapshot): string[] {
  return [
    `Engine Metrics: schema ${snapshot.schemaVersion}, ${snapshot.enabled ? 'enabled' : 'disabled'}, last ${snapshot.capacity} samples per stage`,
    ...Object.entries(snapshot.stages).map(
      ([name, stage]) =>
        `${name}: ${stage.count} operations, total ${stage.totalMs.toFixed(2)} ms; window n=${stage.windowSamples}, median ${stage.medianMs.toFixed(2)} ms, p95 ${stage.p95Ms.toFixed(2)} ms, max ${stage.maxMs.toFixed(2)} ms`,
    ),
    ...Object.entries(snapshot.counters).map(([name, count]) => `${name}: ${count}`),
    'CPU submission, GPU execution and async waits are separate measurements, not additive frame time.',
  ];
}
