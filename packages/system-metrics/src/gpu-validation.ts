import type { GpuPercentStatistics, GpuUsageSummary } from './gpu-types';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
const text = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 256;
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const count = (value: unknown): value is number => number(value) && Number.isSafeInteger(value);
const statistics = (value: unknown): value is GpuPercentStatistics =>
  object(value) &&
  count(value.count) &&
  value.count > 0 &&
  ['min', 'median', 'mean', 'max'].every((key) => number(value[key]) && value[key] <= 100) &&
  (value.min as number) <= (value.median as number) &&
  (value.median as number) <= (value.max as number) &&
  (value.min as number) <= (value.mean as number) &&
  (value.mean as number) <= (value.max as number);

/** Validate the host JSON boundary before attaching measurements to an export result. */
export function readGpuUsage(value: unknown): GpuUsageSummary | undefined {
  if (value === undefined) return undefined;
  if (
    !object(value) ||
    value.version !== 1 ||
    (value.status !== 'available' && value.status !== 'unavailable') ||
    ![null, 'linux-drm', 'windows-pdh', 'macos-iokit'].includes(value.source as string | null) ||
    ![null, 'process', 'device'].includes(value.scope as string | null) ||
    (value.source === null) !== (value.scope === null) ||
    (value.source !== null && value.scope !== (value.source === 'macos-iokit' ? 'device' : 'process')) ||
    !number(value.intervalMs) ||
    value.intervalMs < 250 ||
    value.intervalMs > 10000 ||
    !number(value.durationMs) ||
    !count(value.samples) ||
    !count(value.missedSamples) ||
    value.medianResolution !== 0.1 ||
    !Array.isArray(value.engines) ||
    value.engines.length > 128 ||
    !value.engines.every(
      (row: unknown) =>
        object(row) &&
        text(row.deviceId) &&
        text(row.deviceName) &&
        text(row.engine) &&
        statistics(row.statistics) &&
        count(value.samples) &&
        row.statistics.count <= value.samples,
    ) ||
    new Set(value.engines.map((row) => JSON.stringify([row.deviceId, row.engine]))).size !== value.engines.length ||
    !Array.isArray(value.issues) ||
    value.issues.length > 8 ||
    !value.issues.every((row: unknown) => object(row) && text(row.code) && text(row.reason)) ||
    (value.status === 'available'
      ? !statistics(value.busiestEngine) ||
        value.busiestEngine.count !== value.samples ||
        value.engines.length === 0 ||
        !value.source ||
        !value.scope
      : value.busiestEngine !== null || value.samples !== 0 || value.engines.length !== 0)
  )
    throw new TypeError('Invalid GPU utilization summary from the export host.');
  return value as unknown as GpuUsageSummary;
}
