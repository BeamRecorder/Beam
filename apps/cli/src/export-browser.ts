import { createBrowserExportWorker } from '@beam/encoder/browser';
import { encodeWithWorker } from '@beam/encoder';
import { prepareExportCursorImages } from '@beam/encoder/mediabunny/export-cursor-images';
import type { ExportRequest, ExportDiagnostics } from '@beam/encoder';

const auth = new URL(location.href).searchParams.get('auth');
const endpoint = (name: string) => `/beam-cli/${name}?auth=${encodeURIComponent(auth ?? '')}`;
async function post(name: string, body?: BodyInit, headers?: HeadersInit) {
  const response = await fetch(endpoint(name), { method: 'POST', body, headers });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

try {
  const response = await fetch(endpoint('job'));
  if (!response.ok) throw new Error(await response.text());
  const { request, platform } = (await response.json()) as { request: ExportRequest; platform: string };
  console.debug('Beam export job received.');
  const diagnostics: ExportDiagnostics = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    completedAt: null,
    destinationDialogMs: 0,
    runtime: null,
    environment: {
      appVersion: null,
      platform,
      navigatorPlatform: navigator.platform,
      userAgent: navigator.userAgent,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGb: null,
      screen: `${screen.width}x${screen.height}`,
      viewport: `${innerWidth}x${innerHeight}`,
      devicePixelRatio,
      webgpuAvailable: 'gpu' in navigator,
      webglRenderer: null,
      offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
      videoEncoder: typeof VideoEncoder !== 'undefined',
      videoDecoder: typeof VideoDecoder !== 'undefined',
      audioEncoder: typeof AudioEncoder !== 'undefined',
      audioDecoder: typeof AudioDecoder !== 'undefined',
      hardwareAcceleration: null,
    },
  };
  const cursorImages = await prepareExportCursorImages(request, new AbortController().signal);
  const result = await encodeWithWorker(
    request,
    (progress) => console.debug(`Beam export ${progress.stage}: ${progress.completedImages}/${progress.totalImages}`),
    new AbortController().signal,
    {
      createWorker: createBrowserExportWorker,
      writeChunk: async ({ position, data }) => {
        await post('chunk', data as Uint8Array<ArrayBuffer>, { 'x-beam-position': String(position) });
      },
      finalize: async () => post('finalize'),
      abort: async () => {
        await post('abort');
      },
    },
    diagnostics,
    cursorImages,
  );
  await post('done', JSON.stringify(result));
} catch (error) {
  await post('error', JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
}
