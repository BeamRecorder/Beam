import { mayBeEnabled } from '@beam/engine/scene/scene-visibility';
import { validateRenderDocument } from '@beam/engine/document/render-document-validation';
import type { AudioClip } from '@beam/engine/shared/composition-types';
import { createHttpFrameSource } from '@beam/runtime/frames/http-frame-source';
import { prepareExportCursorImages } from '@beam/encoder/mediabunny/export-cursor-images';
import { loadExportFonts } from '@beam/encoder/mediabunny/export-worker-fonts';
import { loadExportImages } from '@beam/encoder/mediabunny/export-images';
import { openExportAssets } from '@beam/encoder/mediabunny/export-worker-assets';
import { renderExportVideo, renderExportAudio } from '@beam/encoder/mediabunny/export-worker-pipelines';
import type { ExportRuntimeDiagnostics } from '@beam/encoder/export-diagnostics-types';
import type { ExportProgress } from '@beam/encoder/export-types';
import type { ExperimentalGpuExportApi } from './gpu-export-types';
import { createGpuExportWriter } from './experimental-frame-writer';

export async function renderExperimentalExport(api: ExperimentalGpuExportApi) {
  const request = await api.request();
  validateRenderDocument(request.snapshot);
  const started = performance.now();
  const controller = new AbortController();
  const signal = controller.signal;
  const totalFrames = Math.ceil(request.snapshot.duration * request.snapshot.render.fps);
  const owned = new Map<string, ImageBitmap>();
  const audio =
    request.includeAudio === false
      ? []
      : request.snapshot.composition.clips.filter(
          (clip): clip is AudioClip =>
            clip.kind === 'audio' && clip.timelineDurationMs > 0 && mayBeEnabled(request.snapshot.composition, clip),
        );
  const report = (stage: ExportProgress['stage'], completedImages: number, audioProgress: number | null) =>
    api.progress({
      stage,
      overallProgress: completedImages / totalFrames,
      completedImages,
      totalImages: totalFrames,
      audioProgress,
      currentTimeMs: Math.round((completedImages / request.snapshot.render.fps) * 1000),
      totalTimeMs: Math.round(request.snapshot.duration * 1000),
    });
  await report('validating_assets', 0, audio.length ? 0 : null);
  await loadExportFonts(request.snapshot.composition, request.snapshot.fontSources);
  const assets = await openExportAssets(request, signal, () => undefined);
  const validationMs = performance.now() - started;
  let canvas: HTMLCanvasElement | null = null;
  try {
    await report('loading_assets', 0, audio.length ? 0 : null);
    const loadingStarted = performance.now();
    const images = await loadExportImages(request, owned);
    const cursors = new Map<string, ImageBitmap>();
    for (const image of await prepareExportCursorImages(request, signal)) {
      cursors.set(image.id, image.bitmap);
      owned.set(`cursor:${image.id}`, image.bitmap);
    }
    const assetLoadingMs = performance.now() - loadingStarted;
    canvas = document.createElement('canvas');
    canvas.width = request.snapshot.canvas.width;
    canvas.height = request.snapshot.canvas.height;
    canvas.style.display = 'block';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    document.body.append(canvas);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Experimental export requires a Canvas 2D context.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    let lastReport = 0;
    let audioProgress = audio.length ? 0 : null;
    let completed = 0;
    let presentationMs = 0;
    const output = createGpuExportWriter(api, undefined, (elapsedMs) => {
      presentationMs += elapsedMs;
    });
    const videoTask = renderExportVideo(
      request,
      assets,
      images,
      cursors,
      context,
      output,
      signal,
      async (done) => {
        completed = done;
        if (performance.now() - lastReport > 100 || done === totalFrames) {
          lastReport = performance.now();
          await report('encoding', done, audioProgress);
        }
      },
      new Map((request.frameSources ?? []).map((source) => [source.assetId, createHttpFrameSource(source.url)])),
    );
    const audioTask = renderExportAudio(request, assets, audio, output, signal, (done, total) => {
      audioProgress = total ? done / total : 1;
    });
    const abortOnFailure = (error: unknown): never => {
      controller.abort();
      throw error;
    };
    const [videoResult, audioResult] = await Promise.allSettled([
      videoTask.catch(abortOnFailure),
      audioTask.catch(abortOnFailure),
    ]);
    if (videoResult.status === 'rejected') throw videoResult.reason;
    if (audioResult.status === 'rejected') throw audioResult.reason;
    const videoStats = videoResult.value;
    const audioStats = audioResult.value;
    const opened = [...assets.assets.values()];
    const diagnostics: ExportRuntimeDiagnostics = {
      phase: 'finalizing',
      elapsedMs: performance.now() - started,
      validationMs,
      assetLoadingMs,
      outputSetupMs: null,
      videoPipelineMs: videoStats.elapsedMs,
      audioPipelineMs: audioStats?.elapsedMs ?? null,
      muxFinalizationMs: null,
      nativeFinalizationMs: null,
      decodeMs: videoStats.decodeMs,
      renderMs: videoStats.renderMs,
      encoderBackpressureMs: videoStats.encoderBackpressureMs,
      presentationMs,
      ipcWriteWaitMs: 0,
      encodedFps: totalFrames / Math.max(0.001, videoStats.elapsedMs / 1000),
      audioRealtimeSpeed: audioStats?.realtimeSpeed ?? null,
      chunkCount: 0,
      bytesWritten: 0,
      videoCodec: null,
      audioCodec: null,
      engine: videoStats.engine,
      inputVideoCodecs: [
        ...new Set(
          (await Promise.all(opened.map((asset) => asset.video?.getCodec()))).filter(
            (codec): codec is NonNullable<typeof codec> => Boolean(codec),
          ),
        ),
      ],
      inputAudioCodecs: [
        ...new Set(
          (await Promise.all(opened.map((asset) => asset.audio?.getCodec()))).filter(
            (codec): codec is NonNullable<typeof codec> => Boolean(codec),
          ),
        ),
      ],
    };
    await report('finalizing', completed, audioProgress);
    await api.complete(diagnostics);
  } finally {
    assets.dispose();
    for (const bitmap of owned.values()) bitmap.close();
    canvas?.remove();
  }
}
