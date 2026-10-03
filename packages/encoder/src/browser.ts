/** Explicit browser backend; the default encoder entry remains free of worker construction. */
export function createBrowserExportWorker(): Worker {
  return new Worker(new URL('./mediabunny/export.worker.ts', import.meta.url), { type: 'module' });
}
