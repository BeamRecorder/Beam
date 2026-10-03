import type { ExportRequest, ExportProgress } from '../export-types';
import type { ExportRuntimeDiagnostics } from '../export-diagnostics-types';

export interface ExperimentalGpuExportApi {
  request(): Promise<ExportRequest>;
  /** Resolves when a texture is retained by the host queue. Native draining and
   * packet verification finish before complete() permits publication. */
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
