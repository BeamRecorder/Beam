import { expect, it } from 'vitest';
import { readGpuUsage } from './gpu-validation';
import { gpuSummary } from './tests/gpu-fixture';
it('accepts genuine summaries, optional hosts and unavailable measurements', () => {
  const value = gpuSummary();
  expect(readGpuUsage(value)).toBe(value);
  expect(readGpuUsage(undefined)).toBeUndefined();
  expect(
    readGpuUsage({
      ...value,
      status: 'unavailable',
      samples: 0,
      source: null,
      scope: null,
      busiestEngine: null,
      engines: [],
      issues: [{ code: 'unsupported', reason: 'Driver has no counter' }],
    }),
  ).toBeDefined();
});
it('rejects invalid envelope metadata and collection bounds', () => {
  const value = gpuSummary();
  const variants: unknown[] = [
    null,
    false,
    0,
    { ...value, version: 2 },
    { ...value, status: 'sampled' },
    { ...value, source: 'fake' },
    { ...value, scope: 'window' },
  ];
  for (const [key, invalid] of [
    ['intervalMs', 0],
    ['intervalMs', 11000],
    ['intervalMs', NaN],
    ['durationMs', Infinity],
    ['durationMs', -1],
    ['samples', 1.5],
    ['missedSamples', '0'],
    ['medianResolution', 1],
    ['engines', null],
    ['engines', Array(129).fill(value.engines[0])],
    ['issues', false],
    ['issues', Array(9).fill({ code: 'a', reason: 'b' })],
  ] as const)
    variants.push({ ...value, [key]: invalid });
  for (const variant of variants) expect(() => readGpuUsage(variant)).toThrow('Invalid GPU');
});
it('rejects invalid device, engine, issue and statistic records', () => {
  const value = gpuSummary();
  for (const row of [
    null,
    {},
    { ...value.engines[0], deviceId: '' },
    { ...value.engines[0], deviceName: 1 },
    { ...value.engines[0], engine: 'a'.repeat(257) },
    { ...value.engines[0], statistics: null },
  ])
    expect(() => readGpuUsage({ ...value, engines: [row] })).toThrow();
  for (const row of [null, {}, { code: '', reason: 'x' }, { code: 'x', reason: 0 }])
    expect(() => readGpuUsage({ ...value, issues: [row] })).toThrow();
  for (const statistics of [
    null,
    {},
    { ...value.busiestEngine, count: 0 },
    { ...value.busiestEngine, min: -1 },
    { ...value.busiestEngine, max: 101 },
    { ...value.busiestEngine, mean: NaN },
    { ...value.busiestEngine, min: 90, max: 10 },
  ])
    expect(() => readGpuUsage({ ...value, busiestEngine: statistics })).toThrow();
});
it('rejects availability or sample counts that contradict the statistics', () => {
  const value = gpuSummary();
  for (const patch of [
    { samples: 4 },
    { engines: [] },
    { source: null },
    { scope: null },
    { status: 'unavailable' },
    { status: 'unavailable', busiestEngine: null, samples: 1 },
    { status: 'unavailable', busiestEngine: null, samples: 0 },
  ])
    expect(() => readGpuUsage({ ...value, ...patch })).toThrow();
});

it('rejects contradictory source scope, duplicate counters and counts larger than the measurement period', () => {
  const value = gpuSummary();
  for (const patch of [
    { source: 'macos-iokit' },
    { scope: 'device' },
    { source: null },
    { engines: [value.engines[0], value.engines[0]] },
    { engines: [{ ...value.engines[0], statistics: { ...value.busiestEngine, count: 4 } }] },
  ])
    expect(() => readGpuUsage({ ...value, ...patch })).toThrow();
});

it.each([
  ['windows-pdh', 'process'],
  ['macos-iokit', 'device'],
])('accepts the %s backend with its actual %s scope', (source, scope) => {
  expect(readGpuUsage({ ...gpuSummary(), source, scope })).toBeDefined();
});
