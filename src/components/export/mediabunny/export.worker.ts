import { isAudioClip, type AudioClip, type VisualClip } from '~/media/shared/composition-types';
import type { RenderableMedia } from '../composition/render';
import type { ExportProgress, ExportRequest } from '../export-types';
import type { ExportRuntimeDiagnostics } from '../export-diagnostics-types';
import { isExportWorkerRequest, type ExportWorkerResponse } from './export-worker-protocol';
import { loadBitmap, openExportAssets, type ExportAssets } from './export-worker-assets';
import { ExportWorkerOutput } from './export-worker-output';
import { cursorTypeForKind } from '../../video-editor/properties/cursor/cursor-kind';
import { renderExportAudio, renderExportVideo } from './export-worker-pipelines';

let controller: AbortController | null = null;
let output: ExportWorkerOutput | null = null;
let outputCancelPromise: Promise<void> | null = null;
let activeAssets: ExportAssets | null = null;
let activeRun: Promise<void> | null = null;
let lastProgress = 0;

const post = (message: ExportWorkerResponse) => self.postMessage(message);
const progress = (value: ExportProgress, force = false) => {
  const now = performance.now();
  if (!force && now - lastProgress < 100) return;
  lastProgress = now;
  post({ type: 'progress', progress: value });
};

self.onmessage = (event: MessageEvent<unknown>) => {
  if (!isExportWorkerRequest(event.data)) return postError(new TypeError('Invalid export Worker request.'));
  const message = event.data;
  if (message.type === 'cancel') {
    void disposeActiveExport();
  } else if (message.type === 'chunkAck') output?.acknowledge(message.sequence);
  else if (message.type === 'chunkError') output?.reject(message.sequence, message.message);
  else if (!controller) {
    controller = new AbortController();
    activeRun = run(message.request, controller.signal)
      .catch(postError)
      .finally(() => {
        activeRun = null;
        controller = null;
      });
  }
};

async function disposeActiveExport() {
  controller?.abort();
  await cancelOutput();
  await activeRun;
  post({ type: 'disposed' });
}

const cancelOutput = () => {
  if (!output) return Promise.resolve();
  outputCancelPromise ??= output.cancel().catch(() => undefined);
  return outputCancelPromise;
};

async function run(request: ExportRequest, signal: AbortSignal) {
  if (typeof OffscreenCanvas === 'undefined') throw new Error('OffscreenCanvas is required for export.');
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined')
    throw new Error('WebCodecs is required for export.');
  const started = performance.now();
  const totalTimeMs = Math.round(request.snapshot.duration * 1_000);
  const audioClips = request.snapshot.composition.clips.filter(
    (clip): clip is AudioClip => isAudioClip(clip) && clip.enabled && clip.timelineDurationMs > 0,
  );
  if (audioClips.length && (typeof AudioEncoder === 'undefined' || typeof AudioDecoder === 'undefined'))
    throw new Error('WebCodecs audio support is required for export.');
  const totalFrames = Math.max(1, Math.ceil(request.snapshot.duration * request.snapshot.render.fps));
  let assets: ExportAssets | null = null;
  const bitmaps = new Map<string, ImageBitmap>();
  const measured: Omit<ExportRuntimeDiagnostics, 'elapsedMs' | 'phase'> = {
    validationMs: null,
    assetLoadingMs: null,
    outputSetupMs: null,
    videoPipelineMs: null,
    audioPipelineMs: null,
    muxFinalizationMs: null,
    nativeFinalizationMs: null,
    decodeMs: 0,
    renderMs: 0,
    encoderBackpressureMs: 0,
    ipcWriteWaitMs: 0,
    encodedFps: null,
    audioRealtimeSpeed: null,
    chunkCount: 0,
    bytesWritten: 0,
    videoCodec: null,
    audioCodec: null,
    inputVideoCodecs: [],
    inputAudioCodecs: [],
  };
  const diagnostics = (phase: ExportProgress['stage']): ExportRuntimeDiagnostics => ({
    ...measured,
    ...output?.diagnostics(),
    elapsedMs: performance.now() - started,
    phase,
  });
  const report = (value: ExportProgress, force = false) =>
    progress({ ...value, diagnostics: diagnostics(value.stage) }, force);
  try {
    report(baseProgress('validating_assets', 0, totalFrames, audioClips.length > 0, totalTimeMs), true);
    assets = await openExportAssets(request, signal, (completed, total) => {
      const ratio = total ? completed / total : 1;
      report({ ...baseProgress('validating_assets', 0.05 * ratio, totalFrames, audioClips.length > 0, totalTimeMs) });
    });
    activeAssets = assets;
    if (signal.aborted) throw new DOMException('Export cancelled.', 'AbortError');
    measured.validationMs = performance.now() - started;
    const openedAssets = [...assets.assets.values()];
    measured.inputVideoCodecs = [
      ...new Set((await Promise.all(openedAssets.map((asset) => asset.video?.getCodec()))).filter(Boolean) as string[]),
    ];
    measured.inputAudioCodecs = [
      ...new Set((await Promise.all(openedAssets.map((asset) => asset.audio?.getCodec()))).filter(Boolean) as string[]),
    ];
    console.info('[Beam export] asset validation', { elapsedMs: Math.round(measured.validationMs) });
    report(baseProgress('loading_assets', 0.05, totalFrames, audioClips.length > 0, totalTimeMs), true);
    const loadingStarted = performance.now();
    const images = await loadImages(request, bitmaps);
    const cursorImages = await loadCursors(request, bitmaps);
    measured.assetLoadingMs = performance.now() - loadingStarted;
    console.info('[Beam export] asset loading', { elapsedMs: Math.round(measured.assetLoadingMs) });
    report(baseProgress('loading_assets', 0.08, totalFrames, audioClips.length > 0, totalTimeMs), true);

    const canvas = new OffscreenCanvas(request.snapshot.canvas.width, request.snapshot.canvas.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('OffscreenCanvas 2D context is unavailable.');
    const setupStarted = performance.now();
    output = await ExportWorkerOutput.create(request, canvas, audioClips.length > 0);
    outputCancelPromise = null;
    await output.start();
    measured.outputSetupMs = performance.now() - setupStarted;
    const shared = { video: 0, audio: audioClips.length ? 0 : 1 };
    let lastEncodingReport = 0;
    const reportEncoding = (timeMs: number, force = false) => {
      const now = performance.now();
      if (!force && now - lastEncodingReport < 100) return;
      lastEncodingReport = now;
      const workProgress = audioClips.length ? 0.85 * shared.video + 0.15 * shared.audio : shared.video;
      report(
        {
          stage: 'encoding',
          overallProgress: 0.08 + 0.9 * workProgress,
          completedImages: Math.round(shared.video * totalFrames),
          totalImages: totalFrames,
          audioProgress: audioClips.length ? shared.audio : null,
          currentTimeMs: timeMs,
          totalTimeMs,
        },
        true,
      );
    };
    const pipelineController = new AbortController();
    const abortPipeline = () => pipelineController.abort();
    signal.addEventListener('abort', abortPipeline, { once: true });
    if (signal.aborted) abortPipeline();
    const stopPipelines = async <T>(task: Promise<T>) =>
      task.catch(async (error) => {
        pipelineController.abort();
        await cancelOutput();
        throw error;
      });
    const videoTask = stopPipelines(
      renderExportVideo(
        request,
        assets,
        images,
        cursorImages,
        context,
        output,
        pipelineController.signal,
        (done, stats) => {
          measured.decodeMs = stats.decodeMs;
          measured.renderMs = stats.renderMs;
          measured.encoderBackpressureMs = stats.encoderBackpressureMs;
          shared.video = done / totalFrames;
          reportEncoding(Math.round((done / totalFrames) * totalTimeMs));
        },
      ),
    );
    const audioTask = stopPipelines(
      renderExportAudio(request, assets, audioClips, output, pipelineController.signal, (done, total, stats) => {
        measured.audioPipelineMs = stats.elapsedMs;
        measured.audioRealtimeSpeed = stats.realtimeSpeed;
        shared.audio = total ? done / total : 1;
        reportEncoding(Math.round(shared.video * totalTimeMs));
      }),
    );
    const [videoResult, audioResult] = await Promise.allSettled([videoTask, audioTask]);
    signal.removeEventListener('abort', abortPipeline);
    if (videoResult.status === 'rejected' || audioResult.status === 'rejected') {
      const failures = [videoResult, audioResult].filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      const failure = failures.find(
        (result) => !(result.reason instanceof DOMException && result.reason.name === 'AbortError'),
      );
      throw (failure ?? failures[0])!.reason;
    }
    const videoStats = videoResult.value;
    const audioStats = audioResult.value;
    measured.videoPipelineMs = videoStats.elapsedMs;
    measured.decodeMs = videoStats.decodeMs;
    measured.renderMs = videoStats.renderMs;
    measured.encoderBackpressureMs = videoStats.encoderBackpressureMs;
    measured.audioPipelineMs = audioStats?.elapsedMs ?? null;
    measured.audioRealtimeSpeed = audioStats?.realtimeSpeed ?? null;
    measured.encodedFps = totalFrames / Math.max(0.001, videoStats.elapsedMs / 1_000);
    reportEncoding(totalTimeMs, true);
    report(
      {
        stage: 'finalizing',
        overallProgress: 0.98,
        completedImages: totalFrames,
        totalImages: totalFrames,
        audioProgress: audioClips.length ? 1 : null,
        currentTimeMs: totalTimeMs,
        totalTimeMs,
      },
      true,
    );
    const finalizingStarted = performance.now();
    await output.finalize();
    measured.muxFinalizationMs = performance.now() - finalizingStarted;
    console.info('[Beam export] finalization', { elapsedMs: Math.round(measured.muxFinalizationMs) });
    console.info('[Beam export] encoding complete', {
      elapsedMs: Math.round(performance.now() - started),
      encodingFps: Number(measured.encodedFps.toFixed(2)),
    });
    post({ type: 'complete', diagnostics: diagnostics('finalizing') });
  } catch (error) {
    await cancelOutput();
    throw error;
  } finally {
    if (activeAssets === assets) {
      assets?.dispose();
      activeAssets = null;
    }
    for (const bitmap of bitmaps.values()) bitmap.close();
    output = null;
    outputCancelPromise = null;
  }
}

const baseProgress = (
  stage: ExportProgress['stage'],
  overallProgress: number,
  totalImages: number,
  audio: boolean,
  totalTimeMs: number,
): ExportProgress => ({
  stage,
  overallProgress,
  completedImages: 0,
  totalImages,
  audioProgress: audio ? 0 : null,
  currentTimeMs: 0,
  totalTimeMs,
});

async function loadImages(request: ExportRequest, owned: Map<string, ImageBitmap>) {
  const images = new Map<string, RenderableMedia>();
  const activeImageIds = new Set(
    request.snapshot.composition.clips
      .filter((clip): clip is VisualClip => clip.kind === 'image' && clip.enabled && clip.timelineDurationMs > 0)
      .map((clip) => clip.assetId),
  );
  const assets = request.snapshot.composition.assets.filter(
    (asset) => asset.kind === 'image' && activeImageIds.has(asset.id),
  );
  const assetsBySource = new Map(assets.map((asset) => [asset.src, asset]));
  await Promise.all(
    [...assetsBySource].map(async ([source, asset]) => {
      if (owned.has(source)) return;
      owned.set(source, await loadBitmap(source, `image asset "${asset.name}"`));
    }),
  );
  for (const asset of assets) {
    const bitmap = owned.get(asset.src)!;
    images.set(asset.id, { source: bitmap, width: bitmap.width, height: bitmap.height });
  }
  const background = request.snapshot.background;
  if (background?.kind === 'image') {
    if (!owned.has(background.src)) owned.set(background.src, await loadBitmap(background.src, 'background image'));
    const bitmap = owned.get(background.src)!;
    images.set('export-background', { source: bitmap, width: bitmap.width, height: bitmap.height });
  }
  return images;
}

async function loadCursors(request: ExportRequest, owned: Map<string, ImageBitmap>) {
  if (!request.snapshot.cursor.available || request.snapshot.cursor.events.length === 0) return new Map();
  const selected = request.snapshot.cursorSettings.selectedCursor;
  const types = new Set(
    selected === 'automatic'
      ? request.snapshot.cursor.events
          .filter((event) => event.event === 'shape')
          .map((event) => cursorTypeForKind(event.cursorKind))
      : [selected],
  );
  if (!types.size) types.add('default');
  const result = new Map<string, ImageBitmap>();
  await Promise.all(
    [...types].map(async (type) => {
      const path = `macOsPngCursors/${type}.png`;
      const url = import.meta.env.DEV
        ? new URL(`/${path}`, self.location.href).href
        : new URL(`../${path}`, self.location.href).href;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load cursor ${type}.`);
      const rasterWidth = Math.max(1, Math.ceil(request.snapshot.cursorSettings.size * 6));
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(await response.blob(), {
          resizeWidth: rasterWidth,
          resizeHeight: rasterWidth,
          resizeQuality: 'high',
        });
      } catch (error) {
        const decoder = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        throw new Error(`Unable to decode cursor "${type}" from ${url}; decoder: ${decoder}`, { cause: error });
      }
      bitmap = recolorCursor(bitmap, request.snapshot.cursorSettings.color);
      owned.set(`cursor:${type}`, bitmap);
      result.set(type, bitmap);
    }),
  );
  return result;
}

function recolorCursor(bitmap: ImageBitmap, color: string) {
  if (color.toLowerCase() === '#000000') return bitmap;
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (!match) return bitmap;
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  if (!context) return bitmap;
  try {
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const red = Number.parseInt(match[1]!, 16);
    const green = Number.parseInt(match[2]!, 16);
    const blue = Number.parseInt(match[3]!, 16);
    for (let index = 0; index < pixels.data.length; index += 4) {
      if (pixels.data[index]! > 8 || pixels.data[index + 1]! > 8 || pixels.data[index + 2]! > 8) continue;
      pixels.data[index] = red;
      pixels.data[index + 1] = green;
      pixels.data[index + 2] = blue;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.transferToImageBitmap();
  } finally {
    bitmap.close();
  }
}

function postError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return;
  const value = error instanceof Error ? error : new Error('Export failed.');
  post({ type: 'error', error: { name: value.name, message: value.message } });
}
