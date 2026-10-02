import { expect, it } from 'vitest';
import { formatGpuUsage } from './gpu-report';
import { gpuSummary } from './tests/gpu-fixture';
it('reports full-period hardware statistics and their process scope', () => {
  const report = formatGpuUsage(gpuSummary()).join('\n');
  for (const text of [
    'linux-drm',
    'Beam GPU processes',
    'min 10.0%',
    'median 30.0%',
    'mean 40.0%',
    'max 80.0%',
    'n=3',
    'whole measurement period',
    '/ render',
  ])
    expect(report).toContain(text);
});
it('identifies device-wide measurements and keeps diagnostic errors visible', () => {
  const value = gpuSummary();
  value.source = 'macos-iokit';
  value.scope = 'device';
  value.issues = [{ code: 'counter-gap', reason: 'GPU changed' }];
  expect(formatGpuUsage(value).join('\n')).toContain('including other applications');
  expect(formatGpuUsage(value).join('\n')).toContain('counter-gap: GPU changed');
});
it('does not substitute zero for unsupported or unsampled hardware', () => {
  expect(formatGpuUsage().join('\n')).toContain('Unavailable');
  const value = gpuSummary();
  Object.assign(value, {
    status: 'unavailable',
    source: null,
    scope: null,
    samples: 0,
    busiestEngine: null,
    engines: [],
  });
  const report = formatGpuUsage(value).join('\n');
  expect(report).toContain('no completed counter samples');
  expect(report).not.toContain('min 0.0%');
});
