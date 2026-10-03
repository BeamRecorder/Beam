import type { ExportDiagnostics } from '@beam/encoder/export-diagnostics-types';

export type VideoExportBackend = 'webcodecs' | 'ffmpeg-vaapi';
export interface ExportBackendOptions {
  backend: VideoExportBackend;
  overwrite: boolean;
}

export interface FfmpegHostPaths {
  executable: string;
  host: string;
  preload: string;
  nativeDirectory: string;
}

/** Native CLI hosts lack Chromium's browser environment report. Runtime metrics
 * retain the same versioned envelope and field path across both video backends. */
export interface CliVideoExportResult {
  path: string;
  format: 'mp4' | 'webm';
  diagnostics: Omit<ExportDiagnostics, 'environment'> & { environment: ExportDiagnostics['environment'] | null };
}
