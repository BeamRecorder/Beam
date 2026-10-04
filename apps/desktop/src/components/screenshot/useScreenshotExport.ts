import { capture } from '~/api/capture';
import type { ScreenshotExportHost } from './screenshot-export-types';
import type { ScreenshotExportReport } from './export/screenshot-export-diagnostics-types';

export function useScreenshotExport(host: ScreenshotExportHost) {
  return async (copy: boolean) => {
    if (!host.document.value || !host.state.value || host.busy.value) return;
    const started = performance.now();
    host.finishText();
    host.busy.value = true;
    host.error.value = '';
    host.copied.value = false;
    const document = host.document.value;
    const format = copy ? 'png' : host.state.value.format;
    const report: ScreenshotExportReport = {
      operation: copy ? 'copy' : 'export',
      status: 'error',
      projectId: document.id,
      width: host.state.value.canvas.width,
      height: host.state.value.canvas.height,
      format,
      bytes: 0,
      cacheHit: false,
      totalMs: 0,
      timings: {},
    };
    const controller = new AbortController();
    let jobs: Promise<unknown>[] = [];
    let preview: string | undefined;
    const measure = async <T>(stage: string, action: () => Promise<T>) => {
      const start = performance.now();
      try {
        return await action();
      } finally {
        report.timings[stage] = performance.now() - start;
      }
    };
    try {
      const snapshotStart = performance.now();
      let snapshot: typeof host.state.value;
      try {
        snapshot = JSON.parse(JSON.stringify(host.state.value)) as typeof host.state.value;
      } finally {
        report.timings.snapshot = performance.now() - snapshotStart;
      }
      // Saving and encoding the same captured state are independent; publication waits for both.
      const save = measure('save', host.save);
      const encoding = measure('encoding', () =>
        host.encode(
          document.source,
          { ...snapshot, format },
          {
            signal: controller.signal,
            includePreview: true,
            onPreview: (src) => {
              preview = src;
            },
            onTiming: (stage, ms) => {
              report.timings[stage] = ms;
            },
            onCacheHit: () => {
              report.cacheHit = true;
            },
          },
        ),
      );
      jobs = [save, encoding];
      const [, bytes] = await Promise.all([save, encoding]);
      report.bytes = bytes.byteLength;
      const published = await measure('publishRoundTrip', () =>
        capture.exportScreenshot(document.id, bytes, format, copy),
      );
      for (const [stage, ms] of Object.entries(published.timings)) report.timings[`native.${stage}`] = ms;
      report.status = published.status === 'cancelled' ? 'cancelled' : 'success';
      host.copied.value = copy && report.status === 'success';
    } catch (reason) {
      controller.abort(reason);
      await Promise.allSettled(jobs);
      report.error = reason instanceof Error ? reason.message : String(reason);
      host.fail(reason);
    } finally {
      report.totalMs = performance.now() - started;
      host.busy.value = false;
      console.info(`[Beam Screenshot ${report.operation}]`, report);
      console.table(report.timings);
      if (report.status !== 'cancelled') host.notify(report, preview);
    }
  };
}
