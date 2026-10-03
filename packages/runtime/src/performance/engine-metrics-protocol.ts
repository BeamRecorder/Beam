import type { EngineMetricsSnapshot } from '@beam/runtime/performance/engine-metrics-types';

const stages = new Set([
  'load',
  'seek',
  'decode',
  'prepare',
  'edit',
  'render',
  'gesture',
  'copy',
  'paste',
  'encode-wait',
  'gpu-upload',
  'gpu-submit',
  'gpu-execute',
]);
const counters = new Set(['frames', 'gpu-frames', 'decoded', 'dropped', 'uploads', 'draws']);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function isEngineMetricsSnapshot(value: unknown): value is EngineMetricsSnapshot {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    typeof value.enabled !== 'boolean' ||
    !Number.isSafeInteger(value.capacity) ||
    (value.capacity as number) < 1 ||
    (value.capacity as number) > 2048 ||
    !record(value.stages) ||
    !record(value.counters)
  )
    return false;
  return (
    Object.entries(value.stages).every(
      ([key, stage]) =>
        stages.has(key) &&
        record(stage) &&
        Number.isSafeInteger(stage.count) &&
        (stage.count as number) > 0 &&
        Number.isSafeInteger(stage.windowSamples) &&
        (stage.windowSamples as number) > 0 &&
        stage.windowSamples === Math.min(stage.count as number, value.capacity as number) &&
        ['totalMs', 'latestMs', 'medianMs', 'p95Ms', 'maxMs'].every((field) => nonnegative(stage[field])),
    ) &&
    Object.entries(value.counters).every(
      ([key, count]) => counters.has(key) && Number.isSafeInteger(count) && (count as number) >= 0,
    )
  );
}
