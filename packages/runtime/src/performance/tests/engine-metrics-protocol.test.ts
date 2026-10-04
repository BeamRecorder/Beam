import { describe, expect, it } from 'vitest';
import { EngineMetrics } from '@beam/runtime/performance/engine-metrics';
import { isEngineMetricsSnapshot } from '@beam/runtime/performance/engine-metrics-protocol';

const report = () => {
  const metrics = new EngineMetrics({ enabled: true, capacity: 1 });
  metrics.observe('render', 2);
  metrics.count('frames');
  return metrics.snapshot();
};
describe('engine metrics boundary', () => {
  it('accepts empty disabled and populated bounded reports', () => {
    expect(isEngineMetricsSnapshot(new EngineMetrics().snapshot())).toBe(true);
    expect(isEngineMetricsSnapshot(report())).toBe(true);
  });
  it.each([
    null,
    [],
    false,
    {},
    { schemaVersion: 2 },
    { ...report(), capacity: 0 },
    { ...report(), capacity: 2049 },
    { ...report(), enabled: 1 },
    { ...report(), counters: [] },
    { ...report(), stages: null },
  ])('rejects malformed roots: %s', (value) => {
    expect(isEngineMetricsSnapshot(value)).toBe(false);
  });
  it.each(['count', 'windowSamples', 'totalMs', 'latestMs', 'medianMs', 'p95Ms', 'maxMs'])(
    'rejects invalid %s in a stage',
    (key) => {
      const value = report();
      Object.assign(value.stages.render!, { [key]: -1 });
      expect(isEngineMetricsSnapshot(value)).toBe(false);
    },
  );
  it('rejects unknown stages, impossible windows, empty stages and unknown counters', () => {
    expect(isEngineMetricsSnapshot({ ...report(), stages: { oops: {} } })).toBe(false);
    expect(isEngineMetricsSnapshot({ ...report(), stages: { render: [] } })).toBe(false);
    const value = report();
    value.stages.render!.windowSamples = 2;
    expect(isEngineMetricsSnapshot(value)).toBe(false);
    expect(isEngineMetricsSnapshot({ ...report(), counters: { oops: 1 } })).toBe(false);
    expect(isEngineMetricsSnapshot({ ...report(), counters: { frames: -1 } })).toBe(false);
    expect(isEngineMetricsSnapshot({ ...report(), counters: { frames: 1.5 } })).toBe(false);
  });
});
