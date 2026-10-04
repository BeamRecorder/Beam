import { readGpuUsage } from '@beam/system-metrics/gpu-validation';
import { jsonObject } from '@beam/engine/document/json-value';
import { createBrowserExportWorker } from '@beam/encoder/browser';
import { encodeWithWorker } from '@beam/encoder';
import { prepareExportCursorImages } from '@beam/encoder/mediabunny/export-cursor-images';
import type { ExportDiagnostics } from '@beam/encoder';
import type { CliRenderJob } from './render-job-types';
import { prepareScreenshotAssets } from '@beam/runtime/screenshot/screenshot-assets';
import { createScreenshotImageLoader } from '@beam/runtime/screenshot/screenshot-image-loader';
import { captureCompositionFrame } from '@beam/encoder/capture-frame';
import { encodeStillImage } from '@beam/encoder/still-encoder';

const auth = new URL(location.href).searchParams.get('auth');
const endpoint = (name: string) => `/beam-cli/${name}?auth=${encodeURIComponent(auth ?? '')}`;
async function post(name: string, body?: BodyInit, headers?: HeadersInit) {
  const response = await fetch(endpoint(name), {
    method: 'POST',
    body,
    headers,
  });
  if (!response.ok) throw new Error(await response.text());
  return jsonObject((await response.json()) as unknown);
}

async function publishImage(bytes: ArrayBuffer) {
  const data = new Uint8Array(bytes),
    size = 8 * 1024 * 1024;
  for (let position = 0; position < data.length; position += size)
    await post('chunk', data.subarray(position, position + size), { 'x-beam-position': String(position) });
  const result = await post('finalize');
  if (typeof result.path !== 'string') throw new TypeError('Output host returned an invalid destination.');
  return { path: result.path };
}

try {
  const response = await fetch(endpoint('job'));
  if (!response.ok) throw new Error(await response.text());
  const { request, platform } = (await response.json()) as {
    request: CliRenderJob;
    platform: string;
  };
  if ('kind' in request && request.kind === 'frame') {
    const signal = new AbortController().signal;
    const cursors = await prepareExportCursorImages(request.request, signal);
    try {
      const frame = await captureCompositionFrame(
        request.request,
        request.timeMs,
        new Map(cursors.map((cursor) => [cursor.id, cursor.bitmap])),
        signal,
      );
      const output = await publishImage(frame.bytes);
      await post('done', JSON.stringify({ ...output, format: 'png', timeMs: frame.timeMs }));
    } finally {
      for (const cursor of cursors) cursor.bitmap.close();
    }
  } else if ('kind' in request) {
    const assets = await prepareScreenshotAssets(request.document.source, request.document.state, {
      loadImage: createScreenshotImageLoader(),
      fontSource: (id) => request.document.fontSources?.[id] ?? '',
      cursorPacks: request.cursorPacks ?? [],
      watermarkSource: '/brand/BeamIcon.webp',
    });
    const bytes = await encodeStillImage(request.document.state, assets);
    const output = await publishImage(bytes);
    await post('done', JSON.stringify({ ...output, format: request.document.state.format }));
  } else {
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
          await post('chunk', data as Uint8Array<ArrayBuffer>, {
            'x-beam-position': String(position),
          });
        },
        finalize: async () => {
          const result = await post('finalize');
          if (typeof result.path !== 'string') throw new TypeError('Output host returned an invalid destination.');
          return { path: result.path, gpuUsage: readGpuUsage(result.gpuUsage) };
        },
        abort: async () => {
          const result = await post('abort');
          return { gpuUsage: readGpuUsage(result.gpuUsage) };
        },
      },
      diagnostics,
      cursorImages,
    );
    await post('done', JSON.stringify(result));
  }
} catch (error) {
  await post(
    'error',
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}
