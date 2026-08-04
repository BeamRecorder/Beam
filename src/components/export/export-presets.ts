import type { ExportPreset } from './export-types';

const multipliers: Record<ExportPreset, number> = { low: 0.055, medium: 0.095, high: 0.16 };

export const bitrateFor = (preset: ExportPreset, width: number, height: number, fps: number) => {
  const pixelsPerSecond = Math.max(1, width) * Math.max(1, height) * Math.max(1, fps);
  return Math.round(Math.max(500_000, Math.min(40_000_000, pixelsPerSecond * multipliers[preset])));
};
