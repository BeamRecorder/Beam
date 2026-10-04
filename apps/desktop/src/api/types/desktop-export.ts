import type { GpuUsageSummary } from '@beam/system-metrics';
import type { ExportProgress, ExportRequest } from '@beam/encoder/export-types';
import type { ExportRuntimeDiagnostics } from '@beam/encoder/export-diagnostics-types';

export interface DesktopExportApi {
  beginExport(options: {
    projectName: string;
    format: 'webm' | 'mp4';
  }): Promise<{ canceled: true } | { canceled: false; jobId: string }>;
  writeExportChunk(payload: { jobId: string; sequence: number; data: Uint8Array; position: number }): Promise<void>;
  finalizeExport(jobId: string): Promise<{ path: string; gpuUsage?: GpuUsageSummary }>;
  abortExport(jobId: string): Promise<void | { gpuUsage?: GpuUsageSummary }>;
  renderLinuxFfmpegExport(jobId: string, request: ExportRequest, bitrate: number): Promise<ExportRuntimeDiagnostics>;
  onFfmpegExportProgress(callback: (event: { jobId: string; progress: ExportProgress }) => void): () => void;
}
