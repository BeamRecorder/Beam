import type { ExportDiagnostics } from '@beam/encoder/export-diagnostics-types';
import type { ExportProgress, ExportResult } from '@beam/encoder/export-types';
import type { DesktopExportRequest } from '../experimental-export-types';
import { collectExportEnvironment } from '../export-environment';

export const fixturePreview =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCFsAAAAASUVORK5CYII=';

export function waitForFixtureExport(signal?: AbortSignal, progress?: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener('fixture:export-progress', update);
      window.removeEventListener('fixture:export-complete', complete);
      signal?.removeEventListener('abort', abort);
    };
    const update = (event: Event) => progress?.((event as CustomEvent<number>).detail);
    const complete = () => {
      cleanup();
      resolve();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    window.addEventListener('fixture:export-progress', update);
    window.addEventListener('fixture:export-complete', complete);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export async function exportWithMediabunny(
  request: DesktopExportRequest,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal,
  onStarted: (diagnostics: ExportDiagnostics) => void,
): Promise<ExportResult> {
  const diagnostics: ExportDiagnostics = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    completedAt: null,
    destinationDialogMs: 0,
    environment: await collectExportEnvironment(),
    runtime: null,
  };
  onStarted(diagnostics);
  await waitForFixtureExport(signal, (value) =>
    onProgress({
      stage: 'encoding',
      stageLabel: 'Encoding',
      overallProgress: value,
      completedImages: Math.round(value * 100),
      totalImages: 100,
      currentTimeMs: value * 48000,
      totalTimeMs: 48000,
      audioProgress: null,
      preview: fixturePreview,
    }),
  );
  return { path: `/home/test/Videos/Beautiful captures.${request.format}`, format: request.format, diagnostics };
}
