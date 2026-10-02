import { describe, expect, it } from 'vitest';
import { EngineMetrics } from '../engine-metrics';
import { formatEngineMetrics } from '../engine-metrics-report';

describe('portable engine metric report', () => {
  it('formats bounded windows and separate counters without implying additive timings', () => {
    const metrics = new EngineMetrics({ enabled: true, capacity: 2 });
    for (const ms of [10, 4, 6]) metrics.observe('gpu-submit', ms);
    metrics.count('draws', 5);
    expect(formatEngineMetrics(metrics.snapshot())).toEqual([
      'Engine Metrics: schema 1, enabled, last 2 samples per stage',
      'gpu-submit: 3 operations, total 20.00 ms; window n=2, median 6.00 ms, p95 6.00 ms, max 6.00 ms',
      'draws: 5',
      'CPU submission, GPU execution and async waits are separate measurements, not additive frame time.',
    ]);
  });
  it('does not invent stages or counters when disabled or unmeasured', () => {
    const report = formatEngineMetrics(new EngineMetrics().snapshot());
    expect(report).toHaveLength(2);
    expect(report[0]).toContain('disabled');
  });
});
