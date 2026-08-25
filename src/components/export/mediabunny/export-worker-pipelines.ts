import { VideoSampleSink, type InputVideoTrack, type VideoSample } from 'mediabunny';
import { sourceTimeAt } from '~/media/shared';
import { isVisualClip, type AudioClip, type VisualClip } from '~/media/shared/composition-types';
import { createProgressiveAudioMixer } from '~/media/export/pcm-mixer';
import { createCursorMotionPlayer } from '../../video-editor/composables/cursor-motion';
import { renderBackground } from '../../video-editor/composition/background/render-background';
import { resolveCompositionSceneLayers } from '../../video-editor/composition/scene-layers';
import {
  createSnapshotCameraEvaluator,
  disposeCompositionRenderer,
  renderCompositionFrame,
  type RenderableMedia,
} from '../composition/render';
import type { ExportRequest } from '../export-types';
import type { ExportAssets } from './export-worker-assets';
import { ExportWorkerOutput } from './export-worker-output';
import { WATERMARK_LOGO_KEY } from '../../video-editor/canvas/watermark-render';

export type VideoPipelineStats = {
  elapsedMs: number;
  decodeMs: number;
  renderMs: number;
  encoderBackpressureMs: number;
};

const abortIfNeeded = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException('Export cancelled.', 'AbortError');
};

function* clipTimestamps(clip: VisualClip, totalFrames: number, fps: number) {
  const firstFrame = Math.max(0, Math.floor((clip.timelineStartMs * fps) / 1_000));
  const lastFrame = Math.min(totalFrames, Math.ceil(((clip.timelineStartMs + clip.timelineDurationMs) * fps) / 1_000));
  for (let frame = firstFrame; frame < lastFrame; frame += 1) {
    const sourceTime = sourceTimeAt(clip, (frame / fps) * 1_000);
    if (sourceTime !== null) yield sourceTime / 1_000;
  }
}

class BackgroundVideoReader {
  private readonly sink: VideoSampleSink;
  private readonly duration: number;
  private readonly totalFrames: number;
  private readonly fps: number;
  private iterator: AsyncIterator<VideoSample | null> | null = null;
  private loop = -1;

  constructor(track: InputVideoTrack, duration: number, totalFrames: number, fps: number) {
    this.sink = new VideoSampleSink(track);
    this.duration = duration;
    this.totalFrames = totalFrames;
    this.fps = fps;
  }

  private *timestamps(firstFrame: number, loop: number) {
    const loopEnd = Math.min(this.totalFrames, Math.ceil(((loop + 1) * this.duration + Number.EPSILON) * this.fps));
    for (let frame = firstFrame; frame < loopEnd; frame += 1) {
      const timestamp = frame / this.fps - loop * this.duration;
      yield Math.max(0, Math.min(this.duration - Number.EPSILON, timestamp));
    }
  }

  async next(frame: number) {
    const time = frame / this.fps;
    const loop = Math.floor((time + Number.EPSILON) / this.duration);
    if (!this.iterator || loop !== this.loop) {
      await this.iterator?.return?.();
      this.loop = loop;
      this.iterator = this.sink
        .samplesAtTimestamps(this.timestamps(frame, loop), { skipLiveWait: true })
        [Symbol.asyncIterator]();
    }
    const result = await this.iterator.next();
    return result.done ? null : result.value;
  }

  async close() {
    await this.iterator?.return?.();
    this.iterator = null;
  }
}

function prepareStaticBackground(request: ExportRequest, images: ReadonlyMap<string, RenderableMedia>) {
  const value = request.snapshot.background;
  if (!value || value.kind === 'video') return null;
  const original = value.kind === 'image' ? images.get('export-background') : null;
  if (value.kind === 'image' && !original) return null;
  const canvas = new OffscreenCanvas(request.snapshot.canvas.width, request.snapshot.canvas.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Static export background requires an OffscreenCanvas 2D context.');
  renderBackground(context, {
    value,
    source: original?.source,
    sourceSize: original ? { width: original.width, height: original.height } : undefined,
    rect: { x: 0, y: 0, width: canvas.width, height: canvas.height },
    blurPixels: request.snapshot.blurPercent * 0.48,
  });
  return { source: canvas, width: canvas.width, height: canvas.height, preRendered: true } satisfies RenderableMedia;
}

export async function renderExportVideo(
  request: ExportRequest,
  assets: ExportAssets,
  images: ReadonlyMap<string, RenderableMedia>,
  cursorImages: ReadonlyMap<string, ImageBitmap>,
  context: OffscreenCanvasRenderingContext2D,
  mediaOutput: ExportWorkerOutput,
  signal: AbortSignal,
  onFrame: (done: number, stats: Omit<VideoPipelineStats, 'elapsedMs'>) => void,
): Promise<VideoPipelineStats> {
  const started = performance.now();
  let decodeMs = 0;
  let renderMs = 0;
  let encoderBackpressureMs = 0;
  const fps = request.snapshot.render.fps;
  const totalFrames = Math.max(1, Math.ceil(request.snapshot.duration * fps));
  const consumers = new Map<string, AsyncIterator<VideoSample | null>>();
  let backgroundReader: BackgroundVideoReader | null = null;
  try {
    for (const clip of request.snapshot.composition.clips) {
      if (!isVisualClip(clip) || clip.kind === 'image' || !clip.enabled || clip.timelineDurationMs <= 0) continue;
      const track = assets.assets.get(clip.assetId)?.video;
      if (!track) continue;
      consumers.set(
        clip.id,
        new VideoSampleSink(track)
          .samplesAtTimestamps(clipTimestamps(clip, totalFrames, fps), { skipLiveWait: true })
          [Symbol.asyncIterator](),
      );
    }
    const background = assets.assets.get('export-background');
    if (background?.video && background.duration > 0)
      backgroundReader = new BackgroundVideoReader(background.video, background.duration, totalFrames, fps);

    const staticBackground = prepareStaticBackground(request, images);
    const motion = assets.screenSize
      ? createCursorMotionPlayer(
          request.snapshot.cursor.events,
          request.snapshot.cursorSettings.motion,
          assets.screenSize.width,
          assets.screenSize.height,
        )
      : undefined;
    const camera = createSnapshotCameraEvaluator(
      request.snapshot,
      assets.screenSize?.width ?? request.snapshot.canvas.width,
      assets.screenSize?.height ?? request.snapshot.canvas.height,
    );

    for (let frame = 0; frame < totalFrames; frame += 1) {
      abortIfNeeded(signal);
      const time = frame / fps;
      const layers = resolveCompositionSceneLayers(request.snapshot.composition, time * 1_000);
      const activeVisuals = [...layers.cameraVisuals, ...layers.webcams];
      const samples: VideoSample[] = [];
      const decoded: Array<{ clip: VisualClip; sample: VideoSample }> = [];
      const visuals = new Map<string, RenderableMedia>();
      const watermarkLogo = images.get(WATERMARK_LOGO_KEY);
      if (watermarkLogo) visuals.set(WATERMARK_LOGO_KEY, watermarkLogo);
      let screen: RenderableMedia | null = null;
      const decodeStarted = performance.now();
      try {
        for (const clip of activeVisuals) {
          if (clip.kind === 'image') {
            const image = images.get(clip.assetId);
            if (image) visuals.set(clip.id, image);
            continue;
          }
          const result = await consumers.get(clip.id)?.next();
          const sample = !result || result.done ? null : result.value;
          if (!sample) continue;
          samples.push(sample);
          decoded.push({ clip, sample });
        }
        const dynamicBackground = await backgroundReader?.next(frame);
        if (dynamicBackground) samples.push(dynamicBackground);
        for (const { clip, sample } of decoded) {
          const media = {
            source: sample.toCanvasImageSource(),
            width: sample.displayWidth,
            height: sample.displayHeight,
          };
          if (clip.kind === 'screen') screen = media;
          else visuals.set(clip.id, media);
        }
        const backgroundMedia = dynamicBackground
          ? {
              source: dynamicBackground.toCanvasImageSource(),
              width: dynamicBackground.displayWidth,
              height: dynamicBackground.displayHeight,
            }
          : staticBackground;
        decodeMs += performance.now() - decodeStarted;
        const renderStarted = performance.now();
        renderCompositionFrame(
          context,
          screen,
          request.snapshot,
          time,
          backgroundMedia,
          cursorImages,
          visuals,
          motion,
          camera,
          layers,
        );
        renderMs += performance.now() - renderStarted;
      } finally {
        for (const sample of samples) sample.close();
      }
      const encoderStarted = performance.now();
      await mediaOutput.addVideo(time, Math.min(1 / fps, Math.max(0, request.snapshot.duration - time)));
      encoderBackpressureMs += performance.now() - encoderStarted;
      onFrame(frame + 1, { decodeMs, renderMs, encoderBackpressureMs });
    }
    mediaOutput.closeVideo();
    return { elapsedMs: performance.now() - started, decodeMs, renderMs, encoderBackpressureMs };
  } finally {
    disposeCompositionRenderer();
    await Promise.allSettled([
      ...[...consumers.values()].map((consumer) => consumer.return?.()),
      backgroundReader?.close(),
    ]);
  }
}

export async function renderExportAudio(
  request: ExportRequest,
  assets: ExportAssets,
  clips: readonly AudioClip[],
  mediaOutput: ExportWorkerOutput,
  signal: AbortSignal,
  onBlock: (done: number, total: number, stats: { elapsedMs: number; realtimeSpeed: number }) => void,
) {
  if (!clips.length) return null;
  const tracks = new Map(
    [...assets.assets].flatMap(([id, asset]) => (asset.audio ? [[id, asset.audio] as const] : [])),
  );
  const mixer = createProgressiveAudioMixer(clips, tracks, request.snapshot.duration);
  const started = performance.now();
  try {
    for (let block = 0; block < mixer.blockCount; block += 1) {
      abortIfNeeded(signal);
      await mediaOutput.addAudio(await mixer.mixBlock(block, signal));
      const elapsedMs = performance.now() - started;
      onBlock(block + 1, mixer.blockCount, {
        elapsedMs,
        realtimeSpeed: request.snapshot.duration / Math.max(0.001, elapsedMs / 1_000),
      });
    }
    mediaOutput.closeAudio();
    const elapsedMs = performance.now() - started;
    const realtimeSpeed = request.snapshot.duration / Math.max(0.001, elapsedMs / 1_000);
    console.info('[Beam export] audio complete', {
      elapsedMs: Math.round(elapsedMs),
      realtimeSpeed: Number(realtimeSpeed.toFixed(2)),
    });
    return { elapsedMs, realtimeSpeed };
  } finally {
    await mixer.dispose();
  }
}
