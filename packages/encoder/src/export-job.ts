import { mayBeEnabled } from '@beam/engine/scene/scene-visibility';
import type { ExportProgress, ExportRequest, ExportResult } from './export-types';
import { ExportValidationError } from './export-types';
import type { ExportDiagnostics } from './export-diagnostics-types';
import { isExportWorkerResponse, type ExportWorkerRequest } from './mediabunny/export-worker-protocol';
import type { PreparedCursorImage } from './mediabunny/export-cursor-images';
import type { ExportHostServices } from './export-host-types';

const abortError = () => new DOMException('Export cancelled.', 'AbortError');

export async function encodeWithWorker(
  request: ExportRequest,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal,
  host: ExportHostServices,
  diagnostics: ExportDiagnostics,
  cursorImages: PreparedCursorImage[],
): Promise<ExportResult> {
  const closeCursorImages = () => {
    for (const image of cursorImages) image.bitmap.close();
  };
  if (signal.aborted) {
    closeCursorImages();
    await host.abort();
    throw abortError();
  }
  let worker: Worker;
  try {
    worker = host.createWorker();
  } catch (error) {
    closeCursorImages();
    await host.abort().catch(() => undefined);
    throw error;
  }

  return new Promise<ExportResult>((resolve, reject) => {
    let settled = false;
    let cancellationRequested = false;
    let cancellationTimeout: ReturnType<typeof setTimeout> | null = null;
    const finish = (error?: unknown, path?: string) => {
      if (settled) return;
      settled = true;
      if (cancellationTimeout) clearTimeout(cancellationTimeout);
      signal.removeEventListener('abort', cancel);
      worker.terminate();
      if (error) reject(error);
      else resolve({ path: path!, format: request.format, diagnostics });
    };
    const abortNative = async (error: unknown) => {
      await host.abort().catch(() => undefined);
      finish(error);
    };
    const cancel = () => {
      if (cancellationRequested || settled) return;
      cancellationRequested = true;
      worker.postMessage({ type: 'cancel' } satisfies ExportWorkerRequest);
      cancellationTimeout = setTimeout(() => void abortNative(abortError()), 5_000);
    };
    signal.addEventListener('abort', cancel, { once: true });
    worker.onerror = (event) => void abortNative(new Error(event.message || 'The export Worker failed.'));
    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (!isExportWorkerResponse(event.data)) return void abortNative(new Error('Invalid export Worker message.'));
      const message = event.data;
      if (message.type === 'progress') {
        diagnostics.runtime = message.progress.diagnostics ?? diagnostics.runtime;
        return onProgress(message.progress);
      }
      if (message.type === 'error') {
        const error = message.error.issue
          ? new ExportValidationError(message.error.issue)
          : Object.assign(new Error(message.error.message), { name: message.error.name });
        return void abortNative(error);
      }
      if (message.type === 'disposed') {
        if (cancellationRequested) return void abortNative(abortError());
        return void abortNative(new Error('The export Worker disposed unexpectedly.'));
      }
      if (message.type === 'chunk') {
        void host
          .writeChunk({
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
      const nativeFinalizationStarted = performance.now();
      void host.finalize().then(
        ({ path }) => {
          const nativeFinalizationMs = performance.now() - nativeFinalizationStarted;
          diagnostics.completedAt = new Date().toISOString();
          diagnostics.runtime = {
            ...message.diagnostics,
            nativeFinalizationMs,
            elapsedMs: message.diagnostics.elapsedMs + nativeFinalizationMs,
          };
          const totalImages = Math.max(1, Math.ceil(request.snapshot.duration * request.snapshot.render.fps));
          onProgress({
            stage: 'finalizing',
            overallProgress: 1,
            completedImages: totalImages,
            totalImages,
            audioProgress:
              request.includeAudio !== false &&
              request.snapshot.composition.clips.some(
                (clip) =>
                  clip.kind === 'audio' &&
                  mayBeEnabled(request.snapshot.composition, clip) &&
                  clip.timelineDurationMs > 0,
              )
                ? 1
                : null,
            currentTimeMs: Math.round(request.snapshot.duration * 1_000),
            totalTimeMs: Math.round(request.snapshot.duration * 1_000),
            diagnostics: diagnostics.runtime,
          });
          finish(undefined, path);
        },
        (error: unknown) => void abortNative(error),
      );
    };
    try {
      worker.postMessage(
        { type: 'start', request, cursorImages } satisfies ExportWorkerRequest,
        cursorImages.map((image) => image.bitmap),
      );
    } catch (error) {
      closeCursorImages();
      void abortNative(error);
    }
  });
}
