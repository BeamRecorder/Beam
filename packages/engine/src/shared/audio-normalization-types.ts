export interface AudioAnalysis {
  version: number;
  key: string;
  rangeStartMs: number;
  rangeDurationMs: number;
  sampleRate: number;
  channels: number;
  integratedLufs: number | null;
  samplePeakDbfs: number | null;
  truePeakDbtp: number | null;
}

export interface AudioNormalization {
  enabled: boolean;
  mode: 'lufs' | 'peak';
  targetLufs: number;
  targetPeakDbtp: number;
  appliedGainDb: number;
  analysisVersion: number;
  analysisKey: string;
}

export const DEFAULT_AUDIO_NORMALIZATION_TARGET_LUFS = -16;
export const DEFAULT_AUDIO_TRUE_PEAK_DBTP = -1;
export const AUDIO_ANALYSIS_VERSION = 1;
