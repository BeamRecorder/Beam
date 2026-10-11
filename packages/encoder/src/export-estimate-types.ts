import type { ExportPreset } from './export-types';

export interface ExportEstimateInput {
  duration: number;
  width: number;
  height: number;
  fps: number;
  preset: ExportPreset;
  includeAudio: boolean;
}
