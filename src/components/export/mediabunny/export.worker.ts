import { VideoSampleSink } from 'mediabunny';
import { activeClipsAt, sourceTimeAt } from '~/media/shared';
import { isAudioClip, isVisualClip, type AudioClip, type VisualClip } from '~/media/shared/composition-types';
import { createProgressiveAudioMixer } from '~/media/export/pcm-mixer';
import { createCursorMotionPlayer } from '../../video-editor/composables/cursor-motion';
import { createSnapshotCameraEvaluator, renderCompositionFrame, type RenderableMedia } from '../composition/render';
import type { ExportProgress, ExportRequest } from '../export-types';
import { isExportWorkerRequest, type ExportWorkerResponse } from './export-worker-protocol';
import { loadBitmap, openExportAssets, type ExportAssets } from './export-worker-assets';
import { ExportWorkerOutput } from './export-worker-output';
import { cursorTypeForKind } from '../../video-editor/properties/cursor/cursor-kind';

let controller: AbortController | null = null;
let output: ExportWorkerOutput | null = null;
let activeAssets: ExportAssets | null = null;
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
    controller?.abort();
    activeAssets?.dispose();
    activeAssets = null;
    void output?.cancel().catch(() => undefined);
  } else if (message.type === 'chunkAck') output?.acknowledge(message.sequence);
  else if (message.type === 'chunkError') output?.reject(message.sequence, message.message);
  else if (!controller) {
    controller = new AbortController();
    void run(message.request, controller.signal).catch(postError);
  }
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
  try {
    progress(baseProgress('validating_assets', 0, totalFrames, audioClips.length > 0, totalTimeMs), true);
    assets = await openExportAssets(request, signal, (completed, total) => {
      const ratio = total ? completed / total : 1;
      progress({ ...baseProgress('validating_assets', 0.05 * ratio, totalFrames, audioClips.length > 0, totalTimeMs) });
    });
    activeAssets = assets;
    if (signal.aborted) throw new DOMException('Export cancelled.', 'AbortError');
    console.info('[Beam export] asset validation', { elapsedMs: Math.round(performance.now() - started) });
    progress(baseProgress('loading_assets', 0.05, totalFrames, audioClips.length > 0, totalTimeMs), true);
    const loadingStarted = performance.now();
    const images = await loadImages(request, bitmaps);
    const cursorImages = await loadCursors(request, bitmaps);
    console.info('[Beam export] asset loading', { elapsedMs: Math.round(performance.now() - loadingStarted) });
    progress(baseProgress('loading_assets', 0.08, totalFrames, audioClips.length > 0, totalTimeMs), true);

    const canvas = new OffscreenCanvas(request.snapshot.canvas.width, request.snapshot.canvas.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('OffscreenCanvas 2D context is unavailable.');
    output = await ExportWorkerOutput.create(request, canvas, audioClips.length > 0);
    await output.start();
    const encodingStarted = performance.now();
    const shared = { video: 0, audio: audioClips.length ? 0 : 1 };
    const reportEncoding = (timeMs: number) => {
      const media = audioClips.length ? 0.85 * shared.video + 0.15 * shared.audio : shared.video;
      progress({
        stage: 'encoding',
        overallProgress: 0.08 + 0.9 * media,
        completedImages: Math.round(shared.video * totalFrames),
        totalImages: totalFrames,
        audioProgress: audioClips.length ? shared.audio : null,
        currentTimeMs: timeMs,
        totalTimeMs,
      });
    };
    await Promise.all([
      renderVideo(request, assets, images, cursorImages, context, output, signal, (done) => {
        shared.video = done / totalFrames;
        reportEncoding(Math.round((done / totalFrames) * totalTimeMs));
      }),
      renderAudio(request, assets, audioClips, output, signal, (done, total) => {
        shared.audio = total ? done / total : 1;
        reportEncoding(Math.round(shared.video * totalTimeMs));
      }),
    ]);
    progress(
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
    console.info('[Beam export] finalization', { elapsedMs: Math.round(performance.now() - finalizingStarted) });
    console.info('[Beam export] encoding complete', {
      elapsedMs: Math.round(performance.now() - started),
      encodingFps: Number((totalFrames / Math.max(0.001, (performance.now() - encodingStarted) / 1_000)).toFixed(2)),
    });
    post({ type: 'complete' });
  } catch (error) {
    await output?.cancel().catch(() => undefined);
    throw error;
  } finally {
    if (activeAssets === assets) {
      assets?.dispose();
      activeAssets = null;
    }
    for (const bitmap of bitmaps.values()) bitmap.close();
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
  await Promise.all(
    assets.map(async (asset) => {
      if (owned.has(asset.src)) return;
      owned.set(asset.src, await loadBitmap(asset.src, `image asset "${asset.name}"`));
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
      const path = `macOsSvgCursors/${type}.svg`;
      const url = import.meta.env.DEV
        ? new URL(`/${path}`, self.location.href).href
        : new URL(`../${path}`, self.location.href).href;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load cursor ${type}.`);
      let svg = await response.text();
      const color = request.snapshot.cursorSettings.color;
      if (color !== '#000000') svg = svg.replace(/fill="#(?:000000|000)"/gi, `fill="${color}"`);
      const bitmap = await createImageBitmap(new Blob([svg], { type: 'image/svg+xml' }), {
        resizeWidth: Math.max(1, Math.ceil(request.snapshot.cursorSettings.size * 6)),
        resizeQuality: 'high',
      });
      owned.set(`cursor:${type}`, bitmap);
      result.set(type, bitmap);
    }),
  );
  return result;
}

async function renderVideo(
  request: ExportRequest,
  assets: ExportAssets,
  images: Map<string, RenderableMedia>,
  cursorImages: Map<string, ImageBitmap>,
  context: OffscreenCanvasRenderingContext2D,
  mediaOutput: ExportWorkerOutput,
  signal: AbortSignal,
  onFrame: (done: number) => void,
) {
  const consumers = new Map<string, VideoSampleSink>();
  for (const clip of request.snapshot.composition.clips) {
    if (isVisualClip(clip) && clip.kind !== 'image' && clip.enabled) {
      const track = assets.assets.get(clip.assetId)?.video;
      if (track) consumers.set(clip.id, new VideoSampleSink(track));
    }
  }
  const backgroundTrack = assets.assets.get('export-background')?.video;
  const backgroundSink = backgroundTrack ? new VideoSampleSink(backgroundTrack) : null;
  const backgroundDuration = assets.assets.get('export-background')?.duration ?? 0;
  const total = Math.max(1, Math.ceil(request.snapshot.duration * request.snapshot.render.fps));
  const motion = assets.screenSize
    ? createCursorMotionPlayer(
        request.snapshot.cursor.events,
        request.snapshot.cursorSettings.motion,
        assets.screenSize.width,
        assets.screenSize.height,
      )
    : undefined;
  const camera = assets.screenSize
    ? createSnapshotCameraEvaluator(request.snapshot, assets.screenSize.width, assets.screenSize.height)
    : undefined;
  for (let frame = 0; frame < total; frame += 1) {
    if (signal.aborted) throw new DOMException('Export cancelled.', 'AbortError');
    const time = frame / request.snapshot.render.fps;
    const active = activeClipsAt(request.snapshot.composition, time * 1_000);
    const samples: import('mediabunny').VideoSample[] = [];
    const decoded: Array<{ clip: VisualClip; sample: import('mediabunny').VideoSample }> = [];
    const visuals = new Map<string, RenderableMedia>();
    let screen: RenderableMedia | null = null;
    try {
      for (const clip of active) {
        if (!isVisualClip(clip)) continue;
        if (clip.kind === 'image') {
          const image = images.get(clip.assetId);
          if (image) visuals.set(clip.id, image);
          continue;
        }
        const sourceTime = sourceTimeAt(clip, time * 1_000);
        const sample =
          sourceTime === null
            ? null
            : await consumers.get(clip.id)?.getSample(sourceTime / 1_000, { skipLiveWait: true });
        if (!sample) continue;
        samples.push(sample);
        decoded.push({ clip, sample });
      }
      let background: RenderableMedia | null = null;
      if (request.snapshot.background?.kind === 'image') {
        const bitmap = imagesForBackground(request, images);
        if (bitmap) background = bitmap;
      } else if (backgroundSink && backgroundDuration > 0) {
        const sample = await backgroundSink.getSample(time % backgroundDuration, { skipLiveWait: true });
        if (sample) {
          samples.push(sample);
          background = {
            source: sample.toCanvasImageSource(),
            width: sample.displayWidth,
            height: sample.displayHeight,
          };
        }
      }
      for (const { clip, sample } of decoded) {
        const media = {
          source: sample.toCanvasImageSource(),
          width: sample.displayWidth,
          height: sample.displayHeight,
        };
        if (clip.kind === 'screen') screen = media;
        else visuals.set(clip.id, media);
      }
      renderCompositionFrame(
        context,
        screen,
        request.snapshot,
        time,
        background,
        cursorImages,
        visuals,
        motion,
        camera,
      );
    } finally {
      for (const sample of samples) sample.close();
    }
    await mediaOutput.addVideo(time, 1 / request.snapshot.render.fps);
    onFrame(frame + 1);
  }
  mediaOutput.closeVideo();
}

function imagesForBackground(request: ExportRequest, images: Map<string, RenderableMedia>) {
  return request.snapshot.background?.kind === 'image' ? (images.get('export-background') ?? null) : null;
}

async function renderAudio(
  request: ExportRequest,
  assets: ExportAssets,
  clips: ReturnType<typeof audioClipsFor>,
  mediaOutput: ExportWorkerOutput,
  signal: AbortSignal,
  onBlock: (done: number, total: number) => void,
) {
  if (!clips.length) return;
  const tracks = new Map(
    [...assets.assets].flatMap(([id, asset]) => (asset.audio ? [[id, asset.audio] as const] : [])),
  );
  const mixer = createProgressiveAudioMixer(clips, tracks, request.snapshot.duration);
  const started = performance.now();
  for (let block = 0; block < mixer.blockCount; block += 1) {
    await mediaOutput.addAudio(await mixer.mixBlock(block, signal));
    onBlock(block + 1, mixer.blockCount);
  }
  mediaOutput.closeAudio();
  console.info('[Beam export] audio complete', {
    elapsedMs: Math.round(performance.now() - started),
    realtimeSpeed: Number(
      (request.snapshot.duration / Math.max(0.001, (performance.now() - started) / 1_000)).toFixed(2),
    ),
  });
}

function audioClipsFor(request: ExportRequest) {
  return request.snapshot.composition.clips.filter(
    (clip): clip is AudioClip => isAudioClip(clip) && clip.enabled && clip.timelineDurationMs > 0,
  );
}

function postError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return;
  const value = error instanceof Error ? error : new Error('Export failed.');
  post({ type: 'error', error: { name: value.name, message: value.message } });
}
