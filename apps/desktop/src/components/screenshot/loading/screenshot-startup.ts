import { capture } from '~/api/capture';
import type { ScreenshotLoadReport, ScreenshotStartup, ScreenshotStartupData } from './screenshot-startup-types';
import type { EditorResources } from '../../editor/resources/editor-resource-types';

/** One editor owns its requests and report; native/window startup is outside this clock. */
export function createScreenshotStartup(
  libraries: Pick<EditorResources, 'backgrounds' | 'presets'>,
): ScreenshotStartup {
  let report: ScreenshotLoadReport | null = null;
  let request: Promise<ScreenshotStartupData> | undefined;
  let started = 0,
    generation = 0;
  const record = (stage: string, milliseconds: number) => {
    if (report?.status === 'loading') report.timings[stage] = milliseconds;
  };
  const measure = async <T>(stage: string, action: () => Promise<T>): Promise<T> => {
    const current = generation,
      begin = performance.now();
    try {
      return await action();
    } finally {
      if (current === generation) record(stage, performance.now() - begin);
    }
  };
  const complete = (status: 'ready' | 'error') => {
    if (report?.status !== 'loading') return;
    report.status = status;
    report.totalMs = performance.now() - started;
    // The development editor forwards this existing media diagnostic prefix to the terminal.
    console.info(`[Beam media:screenshot-load] ${JSON.stringify(report)}`);
  };
  const start = (id: string) => {
    generation++;
    const current = generation;
    started = performance.now();
    report = { projectId: id, status: 'loading', totalMs: 0, timings: {} };
    request = Promise.all([
      measure('document', () => capture.getScreenshot(id)),
      measure('backgroundLibrary', () => libraries.backgrounds()),
      measure('presets', () => libraries.presets('screenshot')),
    ]).then((data) => {
      if (current === generation && report) {
        const document = data[0],
          state = document.state;
        report.scene = {
          images: state?.images?.length ?? 0,
          shapes: state?.shapes.length ?? 0,
          layers: state?.composition?.length ?? 0,
          historySnapshots: (document.history?.undo.length ?? 0) + (document.history?.redo.length ?? 0),
        };
      }
      return data;
    });
    // Module compilation and document reads overlap. The child awaits and reports a rejected read.
    void request.catch(() => {});
  };
  return {
    start,
    load(id) {
      if (!request || report?.projectId !== id) start(id);
      const pending = request!;
      request = undefined;
      return pending;
    },
    measure,
    time(stage, action) {
      const begin = performance.now();
      try {
        return action();
      } finally {
        record(stage, performance.now() - begin);
      }
    },
    record,
    finish(width, height) {
      if (report?.status !== 'loading') return;
      report.preview = { width, height };
      complete('ready');
    },
    fail(reason) {
      if (report?.status !== 'loading') return;
      report.error = reason instanceof Error ? reason.message : String(reason);
      complete('error');
    },
    report: () => (report ? { ...report, timings: { ...report.timings } } : null),
  };
}
