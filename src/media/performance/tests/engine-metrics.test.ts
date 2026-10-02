import { describe, expect, it, vi } from 'vitest';
import { EngineMetrics } from '../engine-metrics';

describe('bounded engine measurements', () => {
  it.each([0, 2049, NaN, 1.5])('rejects invalid capacity %s', (capacity) => {
    expect(() => new EngineMetrics({ capacity })).toThrow(RangeError);
  });
  it('records no clock or sample work while disabled', async () => {
    const now = vi.fn();
    const metrics = new EngineMetrics({ now });
    metrics.begin('render')();
    metrics.observe('render', NaN);
    metrics.count('frames', -1);
    expect(metrics.measure('render', () => 42)).toBe(42);
    expect(await metrics.measureAsync('decode', async () => 7)).toBe(7);
    expect(now).not.toHaveBeenCalled();
    expect(metrics.snapshot()).toMatchObject({ enabled: false, stages: {}, counters: {} });
  });
  it('bounds the percentile window while preserving lifetime counts and totals', () => {
    const metrics = new EngineMetrics({ enabled: true, capacity: 3 });
    for (const value of [1, 2, 3, 4, 5]) metrics.observe('render', value);
    expect(metrics.snapshot().stages.render).toEqual({
      count: 5,
      totalMs: 15,
      latestMs: 5,
      medianMs: 4,
      p95Ms: 5,
      maxMs: 5,
      windowSamples: 3,
    });
  });
  it('ends once, clamps a clock reversal and discards work across enable/reset boundaries', () => {
    let time = 10;
    const metrics = new EngineMetrics({ enabled: true, now: () => time });
    const end = metrics.begin('render');
    time = 5;
    end();
    end();
    expect(metrics.snapshot().stages.render?.count).toBe(1);
    expect(metrics.snapshot().stages.render?.latestMs).toBe(0);
    const obsolete = metrics.begin('decode');
    metrics.setEnabled(false);
    metrics.setEnabled(false);
    metrics.setEnabled(true);
    obsolete();
    expect(metrics.snapshot().stages.decode).toBeUndefined();
    const reset = metrics.begin('load');
    metrics.reset();
    reset();
    expect(metrics.snapshot().stages).toEqual({});
  });
  it('measures sync and async work, including failures without swallowing them', async () => {
    let time = 0;
    const metrics = new EngineMetrics({ enabled: true, now: () => time });
    expect(
      metrics.measure('prepare', () => {
        time += 4;
        return 'ready';
      }),
    ).toBe('ready');
    expect(() =>
      metrics.measure('gesture', () => {
        time += 2;
        throw new Error('cancel');
      }),
    ).toThrow('cancel');
    expect(
      await metrics.measureAsync('decode', async () => {
        time += 8;
        return 123;
      }),
    ).toBe(123);
    await expect(
      metrics.measureAsync('decode', async () => {
        time += 1;
        throw new Error('bad media');
      }),
    ).rejects.toThrow('bad media');
    expect(metrics.snapshot().stages.decode).toMatchObject({ count: 2, totalMs: 9, latestMs: 1 });
  });
  it('owns independent counters and immutable reports, and resets all samples', () => {
    const metrics = new EngineMetrics({ enabled: true });
    metrics.count('frames');
    metrics.count('frames', 2);
    metrics.count('uploads', 0);
    const snapshot = metrics.snapshot();
    snapshot.counters.frames = 999;
    expect(metrics.snapshot().counters.frames).toBe(3);
    metrics.reset();
    expect(metrics.snapshot().counters).toEqual({});
  });
  it.each([-1, Infinity, NaN])('rejects invalid durations %s', (value) => {
    const metrics = new EngineMetrics({ enabled: true });
    expect(() => metrics.observe('render', value)).toThrow(RangeError);
  });
  it.each([-1, Infinity, 0.5])('rejects invalid increments %s', (value) => {
    expect(() => new EngineMetrics({ enabled: true }).count('frames', value)).toThrow(RangeError);
  });
  it('uses the runtime monotonic clock by default', () => {
    const metrics = new EngineMetrics({ enabled: true });
    metrics.begin('render')();
    expect(metrics.snapshot().stages.render?.latestMs).toBeGreaterThanOrEqual(0);
  });
});
