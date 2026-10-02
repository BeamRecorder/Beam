import { bitrateFor } from '@beam/encoder/export-presets';
import type { ExportProgress, ExportRequest, ExportResult } from '@beam/encoder/export-types';
import type { ExportDiagnostics } from '@beam/encoder/export-diagnostics-types';
import { readGpuUsage } from '@beam/system-metrics/gpu-validation';
import { collectExportEnvironment } from './export-environment';

export async function exportWithLinuxFfmpeg(
  request: ExportRequest,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal,
  onStarted?: (diagnostics: ExportDiagnostics) => void,
): Promise<ExportResult> {
  const api = window.capture;
  if (!api || api.platform !== 'linux') throw new Error('Experimental FFmpeg GPU export is Linux-only.');
  const aborted = () => new DOMException('Export cancelled.', 'AbortError');
  if (signal.aborted) throw aborted();
  const startedAt = new Date().toISOString();
  const dialogStarted = performance.now();
  const opened = await api.beginExport({ projectName: request.projectName, format: request.format });
  if (opened.canceled) throw aborted();
  const destinationDialogMs = performance.now() - dialogStarted;
  let unsubscribe: (() => void) | undefined;
  const cancel = () => {
    void api.abortExport(opened.jobId).catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) throw aborted();
    const diagnostics: ExportDiagnostics = {
      schemaVersion: 1,
      startedAt,
      completedAt: null,
      destinationDialogMs,
      environment: await collectExportEnvironment(),
      runtime: null,
    };
    onStarted?.(diagnostics);
    unsubscribe = api.onFfmpegExportProgress((event) => {
      if (event.jobId === opened.jobId) onProgress(event.progress);
    });
    diagnostics.runtime = await api.renderLinuxFfmpegExport(
      opened.jobId,
      request,
      bitrateFor(
        request.preset,
        request.snapshot.canvas.width,
        request.snapshot.canvas.height,
        request.snapshot.render.fps,
      ),
    );
    if (signal.aborted) throw aborted();
    const nativeFinalizationStarted = performance.now();
    const final = await api.finalizeExport(opened.jobId);
    diagnostics.gpuUsage = readGpuUsage(final.gpuUsage);
    diagnostics.completedAt = new Date().toISOString();
    const nativeFinalizationMs = performance.now() - nativeFinalizationStarted;
    diagnostics.runtime = {
      ...diagnostics.runtime,
      nativeFinalizationMs,
      elapsedMs: performance.now() - dialogStarted - destinationDialogMs,
    };
    return { path: final.path, format: request.format, diagnostics };
  } catch (error) {
    await api.abortExport(opened.jobId).catch(() => undefined);
    throw signal.aborted ? aborted() : error;
  } finally {
    unsubscribe?.();
    signal.removeEventListener('abort', cancel);
  }
}
