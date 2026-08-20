import { isAudioClip, type AudioClip, type VisualClip } from '~/media/shared/composition-types';
import type { RenderableMedia } from '../composition/render';
import { ExportValidationError, type ExportProgress, type ExportRequest } from '../export-types';
import type { ExportRuntimeDiagnostics } from '../export-diagnostics-types';
import { isExportWorkerRequest, type ExportWorkerResponse } from './export-worker-protocol';
import { loadBitmap, openExportAssets, type ExportAssets } from './export-worker-assets';
import { ExportWorkerOutput } from './export-worker-output';
import { renderExportAudio, renderExportVideo } from './export-worker-pipelines';
import { loadExportFonts } from './export-worker-fonts';
import { WATERMARK_LOGO_KEY, WATERMARK_LOGO_PATH } from '../../video-editor/canvas/watermark-render';
import type { PreparedCursorImage } from './export-cursor-images';
import { requiredExportCursorAssets } from './export-cursor-selection';

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
    activeRun = run(message.request, message.cursorImages, controller.signal)
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

async function run(request: ExportRequest, preparedCursorImages: PreparedCursorImage[], signal: AbortSignal) {
  const started = performance.now();
  const totalTimeMs = Math.round(request.snapshot.duration * 1_000);
  const audioClips =
    request.includeAudio !== false
      ? request.snapshot.composition.clips.filter(
          (clip): clip is AudioClip => isAudioClip(clip) && clip.enabled && clip.timelineDurationMs > 0,
        )
      : [];
  const totalFrames = Math.max(1, Math.ceil(request.snapshot.duration * request.snapshot.render.fps));
  let assets: ExportAssets | null = null;
  const bitmaps = new Map<string, ImageBitmap>();
  const transferredCursors = new Map<string, ImageBitmap>();
  for (const image of preparedCursorImages) {
    const previous = transferredCursors.get(image.id);
    previous?.close();
    transferredCursors.set(image.id, image.bitmap);
    bitmaps.set(`cursor:${image.id}`, image.bitmap);
  }
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
    if (typeof OffscreenCanvas === 'undefined') throw new Error('OffscreenCanvas is required for export.');
    if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined')
      throw new Error('WebCodecs is required for export.');
    if (audioClips.length && (typeof AudioEncoder === 'undefined' || typeof AudioDecoder === 'undefined'))
      throw new Error('WebCodecs audio support is required for export.');
    report(baseProgress('validating_assets', 0, totalFrames, audioClips.length > 0, totalTimeMs), true);
    await loadExportFonts(request.snapshot.composition);
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
    const cursorImages = loadCursors(request, transferredCursors);
    measured.assetLoadingMs = performance.now() - loadingStarted;
    console.info('[Beam export] asset loading', { elapsedMs: Math.round(measured.assetLoadingMs) });
    report(baseProgress('loading_assets', 0.08, totalFrames, audioClips.length > 0, totalTimeMs), true);

    const canvas = new OffscreenCanvas(request.snapshot.canvas.width, request.snapshot.canvas.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('OffscreenCanvas 2D context is unavailable.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
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
  const watermark = request.snapshot.canvas.watermark;
  if (watermark?.enabled && watermark.showLogo) {
    const path = WATERMARK_LOGO_PATH.replace(/^\//, '');
    const source = import.meta.env.DEV
      ? new URL(`/${path}`, self.location.href).href
      : new URL(`../${path}`, self.location.href).href;
    if (!owned.has(source)) owned.set(source, await loadBitmap(source, 'Beam watermark logo'));
    const bitmap = owned.get(source)!;
    images.set(WATERMARK_LOGO_KEY, { source: bitmap, width: bitmap.width, height: bitmap.height });
  }
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

function loadCursors(request: ExportRequest, prepared: Map<string, ImageBitmap>) {
  const assets = requiredExportCursorAssets(request);
  const result = new Map<string, ImageBitmap>();
  for (const asset of assets) {
    const bitmap = prepared.get(asset.id);
    if (!bitmap)
      throw new ExportValidationError({
        code: 'decode-failure',
        message: `Cursor "${asset.id}" was not rasterized before export.`,
        assetId: asset.id,
      });
    result.set(asset.id, bitmap);
  }
  return result;
}

function postError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return;
  const value = error instanceof Error ? error : new Error('Export failed.');
  post({
    type: 'error',
    error: {
      name: value.name,
      message: value.message,
      ...(value instanceof ExportValidationError ? { issue: value.issue } : {}),
    },
  });
}
