import type { ExportProgress, ExportRequest, ExportResult } from '../export-types';
import { ExportValidationError } from '../export-types';
import { isExportWorkerResponse, type ExportWorkerRequest } from './export-worker-protocol';

const abortError = () => new DOMException('Export cancelled.', 'AbortError');

export async function exportWithMediabunny(
  request: ExportRequest,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  if (signal.aborted) throw abortError();
  if (typeof Worker === 'undefined') throw new Error('Web Workers are unavailable; export cannot run on this device.');

  const opened = await window.capture?.beginExport({ projectName: request.projectName, format: request.format });
  if (!opened || opened.canceled) throw abortError();
  if (signal.aborted) {
    await window.capture!.abortExport(opened.jobId).catch(() => undefined);
    throw abortError();
  }
  const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });

  return new Promise<ExportResult>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, path?: string) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', cancel);
      worker.terminate();
      if (error) reject(error);
      else resolve({ path: path!, format: request.format });
    };
    const abortNative = async (error: unknown) => {
      await window.capture!.abortExport(opened.jobId).catch(() => undefined);
      finish(error);
    };
    const cancel = () => {
      worker.postMessage({ type: 'cancel' } satisfies ExportWorkerRequest);
      void abortNative(abortError());
    };
    signal.addEventListener('abort', cancel, { once: true });
    worker.onerror = (event) => void abortNative(new Error(event.message || 'The export Worker failed.'));
    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (!isExportWorkerResponse(event.data)) return void abortNative(new Error('Invalid export Worker message.'));
      const message = event.data;
      if (message.type === 'progress') return onProgress(message.progress);
      if (message.type === 'error') {
        const error = message.error.issue
          ? new ExportValidationError(message.error.issue)
          : Object.assign(new Error(message.error.message), { name: message.error.name });
        return void abortNative(error);
      }
      if (message.type === 'chunk') {
        void window
          .capture!.writeExportChunk({
            jobId: opened.jobId,
            sequence: message.sequence,
            position: message.position,
            data: message.data,
          })
          .then(
            () => worker.postMessage({ type: 'chunkAck', sequence: message.sequence } satisfies ExportWorkerRequest),
            (error: unknown) => {
              const text = error instanceof Error ? error.message : 'Export chunk write failed.';
              worker.postMessage({
                type: 'chunkError',
                sequence: message.sequence,
                message: text,
              } satisfies ExportWorkerRequest);
              void abortNative(error);
            },
          );
        return;
      }
      void window.capture!.finalizeExport(opened.jobId).then(
        ({ path }) => {
          const totalImages = Math.max(1, Math.ceil(request.snapshot.duration * request.snapshot.render.fps));
          onProgress({
            stage: 'finalizing',
            overallProgress: 1,
            completedImages: totalImages,
            totalImages,
            audioProgress: request.snapshot.composition.clips.some((clip) => clip.kind === 'audio' && clip.enabled)
              ? 1
              : null,
            currentTimeMs: Math.round(request.snapshot.duration * 1_000),
            totalTimeMs: Math.round(request.snapshot.duration * 1_000),
          });
          finish(undefined, path);
        },
        (error: unknown) => void abortNative(error),
      );
    };
    worker.postMessage({ type: 'start', request } satisfies ExportWorkerRequest);
  });
}
