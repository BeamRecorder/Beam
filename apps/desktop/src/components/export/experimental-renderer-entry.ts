import { renderExperimentalExport } from './experimental-renderer';

const api = window.gpuExport;
if (!api) throw new Error('The experimental export preload is unavailable.');
void renderExperimentalExport(api).catch((error: unknown) =>
  api.error(error instanceof Error ? error.message : String(error)),
);
