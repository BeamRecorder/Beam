// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGpuMonitor, isGpuUsageSample, type GpuMonitor, type GpuMonitorOptions } from './gpu-monitor.cjs';
const monitors: GpuMonitor[] = [];
const sampled = (percent: number) => ({
  version: 1,
  status: 'sampled',
  source: 'linux-drm',
  scope: 'process',
  devices: [{ id: 'pci-0', name: 'i915', engines: [{ name: 'render', busyPercent: percent }] }],
});
const start = (
  sample: GpuMonitorOptions['sample'] = vi.fn(async () => sampled(10)),
  extras: Partial<GpuMonitorOptions> = {},
) => {
  const dispose = vi.fn(async () => undefined);
  const monitor = createGpuMonitor({ processIds: () => [42, 42], sample, dispose, clock: () => Date.now(), ...extras });
  monitors.push(monitor);
  return { monitor, sample, dispose };
};
beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  await Promise.all(monitors.splice(0).map((monitor) => monitor.finish()));
  vi.useRealTimers();
});
it('aggregates the entire export and finishes once, using a histogram for the median', async () => {
  const values = [
    { version: 1, status: 'warming', source: 'linux-drm', scope: 'process' },
    sampled(20),
    sampled(40),
    sampled(60),
  ];
  const state = start(vi.fn(async () => values.shift() ?? sampled(60)));
  await vi.advanceTimersByTimeAsync(2000);
  const first = state.monitor.finish(),
    second = state.monitor.finish();
  expect(first).toBe(second);
  const result = await first;
  expect(result.busiestEngine).toEqual({ count: 3, min: 20, median: 40, mean: 40, max: 60 });
  expect(result.engines[0].statistics).toEqual(result.busiestEngine);
  expect(state.sample).toHaveBeenCalledWith([42]);
  expect(state.dispose).toHaveBeenCalledOnce();
  const duration = result.durationMs;
  await vi.advanceTimersByTimeAsync(10000);
  expect(state.monitor.snapshot().durationMs).toBe(duration);
  expect(state.sample).toHaveBeenCalledTimes(4);
});
it('uses the busiest engine without summing independent hardware units and handles even medians', async () => {
  const value = sampled(10);
  value.devices[0].engines.push({ name: 'video', busyPercent: 40 });
  const state = start(vi.fn(async () => value));
  await vi.advanceTimersByTimeAsync(0);
  value.devices[0].engines[1].busyPercent = 80;
  const result = await state.monitor.finish();
  expect(result.busiestEngine?.median).toBe(60);
  expect(result.busiestEngine?.max).toBe(80);
  expect(result.engines).toHaveLength(2);
});
it('does not overlap native reads or invent zeros for unsupported devices', async () => {
  let release!: (value: unknown) => void;
  const sample = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValue({ version: 1, status: 'unavailable', code: 'driver', reason: 'No GPU counter' });
  const state = start(sample);
  await vi.advanceTimersByTimeAsync(5000);
  expect(sample).toHaveBeenCalledOnce();
  release({ version: 1, status: 'warming', source: 'linux-drm', scope: 'process' });
  const result = await state.monitor.finish();
  expect(result.busiestEngine).toBeNull();
  expect(result.status).toBe('unavailable');
  expect(result.issues).toEqual([{ code: 'driver', reason: 'No GPU counter' }]);
});
it('reports native failures and failed cleanup while retaining real samples', async () => {
  const sample = vi.fn().mockResolvedValueOnce(sampled(12)).mockRejectedValue('counter lost');
  const state = start(sample, {
    dispose: async () => {
      throw new Error('native exit');
    },
  });
  await vi.advanceTimersByTimeAsync(0);
  const result = await state.monitor.finish();
  expect(result.samples).toBe(1);
  expect(result.missedSamples).toBe(1);
  expect(result.issues.map((issue) => issue.reason)).toEqual(['counter lost', 'native exit']);
});
it('rejects invalid intervals, identifiers and malformed counter responses', async () => {
  for (const intervalMs of [0, 249, 10001, NaN, Infinity])
    expect(() => start(undefined, { intervalMs })).toThrow('interval');
  for (const processIds of [() => [-1], () => Array(17).fill(1)]) {
    const state = start(undefined, { processIds });
    expect((await state.monitor.finish()).issues[0].reason).toContain('identifiers');
  }
  const state = start(vi.fn(async () => ({ version: 1, status: 'sampled' })));
  expect((await state.monitor.finish()).issues[0].reason).toContain('response');
});
it('rejects counter identity collisions, source changes and unbounded engine inventories', async () => {
  const value = sampled(10);
  value.devices[0].engines.push({ name: 'render', busyPercent: 20 });
  expect((await start(vi.fn(async () => value)).monitor.finish()).issues[0].reason).toContain('Duplicate');
  const sample = vi
    .fn()
    .mockResolvedValueOnce(sampled(30))
    .mockResolvedValue({ ...sampled(50), source: 'macos-iokit', scope: 'device' });
  const state = start(sample);
  await vi.advanceTimersByTimeAsync(0);
  expect((await state.monitor.finish()).issues[0].reason).toContain('scope changed');
  const many = sampled(0);
  many.devices = Array.from({ length: 3 }, (_, index) => ({
    id: String(index),
    name: 'GPU',
    engines: Array.from({ length: 64 }, (_, name) => ({ name: String(name), busyPercent: 0 })),
  }));
  expect((await start(vi.fn(async () => many)).monitor.finish()).issues[0].reason).toContain('limit');
});
it('validates all supported sample variants and invalid boundary fields', () => {
  expect(isGpuUsageSample(sampled(0))).toBe(true);
  expect(isGpuUsageSample(sampled(100))).toBe(true);
  for (const value of [
    null,
    [],
    {},
    { version: 2 },
    { version: 1, status: 'unavailable', code: '', reason: 'x' },
    { ...sampled(1), source: 'fake' },
    { ...sampled(1), scope: 'window' },
    { ...sampled(1), devices: [] },
    sampled(-1),
    sampled(101),
    sampled(NaN),
  ])
    expect(isGpuUsageSample(value)).toBe(false);
  const state = start();
  expect(state.monitor.snapshot().issues[0].code).toBe('no-samples');
});

it.each([0.04, 99.96])('keeps rounded medians within genuine observed bounds at %s percent', async (percent) => {
  const state = start(vi.fn(async () => sampled(percent)));
  const result = await state.monitor.finish();
  expect(result.busiestEngine).toMatchObject({ min: percent, median: percent, mean: percent, max: percent });
});

it('keeps an empty diagnostic usable without inventing a GPU percentage', async () => {
  const state = start(vi.fn().mockRejectedValue(new Error('')));
  const result = await state.monitor.finish();
  expect(result.busiestEngine).toBeNull();
  expect(result.issues[0].reason).toContain('empty diagnostic');
});
