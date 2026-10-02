export type GpuCounterSource = 'linux-drm' | 'windows-pdh' | 'macos-iokit';
export type GpuCounterScope = 'process' | 'device';
export interface GpuDeviceSample {
  id: string;
  name: string;
  engines: { name: string; busyPercent: number }[];
}
export type GpuUsageSample =
  | { version: 1; status: 'sampled'; source: GpuCounterSource; scope: GpuCounterScope; devices: GpuDeviceSample[] }
  | { version: 1; status: 'warming'; source: GpuCounterSource; scope: GpuCounterScope }
  | { version: 1; status: 'unavailable'; code: string; reason: string };
export interface GpuPercentStatistics {
  count: number;
  min: number;
  median: number;
  mean: number;
  max: number;
}
export interface GpuUsageSummary {
  version: 1;
  status: 'available' | 'unavailable';
  source: GpuCounterSource | null;
  scope: GpuCounterScope | null;
  intervalMs: number;
  durationMs: number;
  samples: number;
  missedSamples: number;
  /** Maximum observed engine load per poll; independent engines are never summed. */
  busiestEngine: GpuPercentStatistics | null;
  engines: { deviceId: string; deviceName: string; engine: string; statistics: GpuPercentStatistics }[];
  /** Median histogram resolution in percentage points, across the whole measurement period. */
  medianResolution: 0.1;
  issues: { code: string; reason: string }[];
}
