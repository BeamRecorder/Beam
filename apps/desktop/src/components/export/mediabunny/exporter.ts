import { readGpuUsage } from '@beam/system-metrics/gpu-validation';
import { createBrowserExportWorker } from '@beam/encoder/browser';
import { encodeWithWorker } from '@beam/encoder/export-job';
import type { ExportProgress, ExportResult } from '@beam/encoder/export-types';
import type { ExportDiagnostics } from '@beam/encoder/export-diagnostics-types';
import { collectExportEnvironment } from '~/components/export/export-environment';
import { prepareExportCursorImages } from '@beam/encoder/mediabunny/export-cursor-images';
import type { DesktopExportRequest } from '../experimental-export-types';
import { withHtmlFrameSources } from '../../authoring/html-export';

const abortError = () => new DOMException('Export cancelled.', 'AbortError');

export async function exportWithMediabunny(
  request: DesktopExportRequest,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal,
  onStarted?: (diagnostics: ExportDiagnostics) => void,
): Promise<ExportResult> {
  request = await withHtmlFrameSources(request);
  if (request.experimentalLinuxFfmpeg) {
    const { exportWithLinuxFfmpeg } = await import('../experimental-exporter');
    return exportWithLinuxFfmpeg(request, onProgress, signal, onStarted);
  }
  if (signal.aborted) throw abortError();
  if (typeof Worker === 'undefined') throw new Error('Web Workers are unavailable; export cannot run on this device.');
  const cursorImages = await prepareExportCursorImages(request, signal);
  const closeCursorImages = () => {
    for (const image of cursorImages) image.bitmap.close();
  };
  if (signal.aborted) {
    closeCursorImages();
    throw abortError();
  }

  const startedAt = new Date().toISOString();
  const environmentPromise = collectExportEnvironment();
  const dialogStarted = performance.now();
  let opened: Awaited<ReturnType<NonNullable<typeof window.capture>['beginExport']>> | undefined;
  try {
    opened = await window.capture?.beginExport({
      projectName: request.projectName,
      format: request.format,
    });
  } catch (error) {
    closeCursorImages();
    throw error;
  }
  const destinationDialogMs = performance.now() - dialogStarted;
  if (!opened || opened.canceled) {
    closeCursorImages();
    throw abortError();
  }
  let diagnostics: ExportDiagnostics;
  try {
    diagnostics = {
      schemaVersion: 1,
      startedAt,
      completedAt: null,
      destinationDialogMs,
      environment: await environmentPromise,
      runtime: null,
    };
  } catch (error) {
    closeCursorImages();
    await window.capture!.abortExport(opened.jobId).catch(() => undefined);
    throw error;
  }
  try {
    onStarted?.(diagnostics);
  } catch (error) {
    closeCursorImages();
    await window.capture!.abortExport(opened.jobId).catch(() => undefined);
    throw error;
  }
  if (signal.aborted) {
    closeCursorImages();
    await window.capture!.abortExport(opened.jobId).catch(() => undefined);
    throw abortError();
  }
  return encodeWithWorker(
    request,
    onProgress,
    signal,
    {
      createWorker: createBrowserExportWorker,
      writeChunk: (chunk) => window.capture!.writeExportChunk({ jobId: opened.jobId, ...chunk }),
      finalize: async () => {
        const result = await window.capture!.finalizeExport(opened.jobId);
        return { ...result, gpuUsage: readGpuUsage(result.gpuUsage) };
      },
      abort: () => window.capture!.abortExport(opened.jobId),
    },
    diagnostics,
    cursorImages,
  );
}
