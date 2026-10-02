import type { ExportRequest, ExportProgress } from '@beam/encoder/export-types';
import type { ExportRuntimeDiagnostics } from '@beam/encoder/export-diagnostics-types';

export interface DesktopExportRequest extends ExportRequest {
  experimentalLinuxFfmpeg?: boolean;
}

export interface ExperimentalGpuExportApi {
  request(): Promise<ExportRequest>;
  prepareFrame(sequence: number): Promise<void>;
  frame(sequence: number): Promise<void>;
  audio(data: Uint8Array, firstFrame: number): Promise<void>;
  progress(progress: ExportProgress): Promise<void>;
  complete(diagnostics: ExportRuntimeDiagnostics): Promise<void>;
  error(message: string): Promise<void>;
}

declare global {
  interface Window {
    gpuExport?: ExperimentalGpuExportApi;
  }
}
