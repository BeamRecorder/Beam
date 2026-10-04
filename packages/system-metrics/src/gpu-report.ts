import type { GpuPercentStatistics, GpuUsageSummary } from './gpu-types';
const percent = (value: number) => `${value.toFixed(1)}%`;
const statistics = (value: GpuPercentStatistics) =>
  `min ${percent(value.min)}, median ${percent(value.median)}, mean ${percent(value.mean)}, max ${percent(value.max)} (n=${value.count})`;

export function formatGpuUsage(summary?: GpuUsageSummary): string[] {
  if (!summary) return ['GPU Utilization: Unavailable (host supplied no native measurements)'];
  const lines = [
    '--- Native GPU Utilization ---',
    `GPU Counter Source: ${summary.source ?? 'Unavailable'}`,
    `GPU Measurement Scope: ${summary.scope === 'process' ? 'Beam GPU processes (shared by app windows)' : summary.scope === 'device' ? 'Entire GPU device, including other applications' : 'Unavailable'}`,
    `GPU Sampling: ${summary.intervalMs} ms requested interval, ${summary.samples} samples, ${summary.missedSamples} unavailable reads, ${Math.round(summary.durationMs)} ms measured`,
  ];
  if (summary.busiestEngine) {
    lines.push(`GPU Busiest Engine: ${statistics(summary.busiestEngine)}`);
    for (const row of summary.engines)
      lines.push(`GPU ${row.deviceName} [${row.deviceId}] / ${row.engine}: ${statistics(row.statistics)}`);
    lines.push(
      'GPU utilization is busy time, not compute efficiency; independent engines are not added.',
      `GPU median resolution: ${summary.medianResolution} percentage points; statistics cover the whole measurement period.`,
    );
  } else lines.push('GPU Utilization: Unavailable (no completed counter samples)');
  for (const issue of summary.issues) lines.push(`GPU Diagnostic: ${issue.code}: ${issue.reason}`);
  return lines;
}
