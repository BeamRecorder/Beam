import type { GpuUsageSummary } from '../gpu-types';
export function gpuSummary(): GpuUsageSummary {
  const statistics = { count: 3, min: 10, median: 30, mean: 40, max: 80 };
  return {
    version: 1,
    status: 'available',
    source: 'linux-drm',
    scope: 'process',
    intervalMs: 1000,
    durationMs: 3000,
    samples: 3,
    missedSamples: 0,
    busiestEngine: statistics,
    engines: [{ deviceId: 'pci-1', deviceName: 'i915', engine: 'render', statistics }],
    medianResolution: 0.1,
    issues: [],
  };
}
