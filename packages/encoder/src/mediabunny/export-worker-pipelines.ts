import type { FrameSource, FrameLease } from '@beam/runtime/frames/frame-source-types';
import { mayBeEnabled } from '@beam/engine/scene/scene-visibility';
import { createSnapshotCameraEvaluator } from '@beam/runtime/rendering/snapshot-camera';
import { VideoSampleSink, type VideoSample } from 'mediabunny';
import { engineMetrics } from '@beam/runtime/performance/engine-metrics';
import type { VideoPipelineStats, VideoFrameWriter, AudioFrameWriter, ExportFrameRange } from './video-pipeline-types';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import { sourceTimeAt } from '@beam/runtime/shared/index';
import { isVisualClip, type AudioClip, type VisualClip } from '@beam/engine/shared/composition-types';
import { createProgressiveAudioMixer } from '@beam/encoder/audio/pcm-mixer';
import { createCursorMotionPlayer } from '@beam/engine/cursor/cursor-motion';
import { renderBackground } from '@beam/runtime/composition/background/render-background';
import { createCompositionSceneLayerResolver } from '@beam/engine/composition/scene-layers';
import { compileSceneComposition } from '@beam/engine/scene/scene-clock';
import { softwareLinuxDecoderOptions } from '@beam/runtime/playback/playback-decoder';
import { playbackVideoDecodeKey } from '@beam/runtime/playback/shared-video-plan';
import { disposeMediaShadowCache } from '@beam/runtime/composition/appearance/media-shadow-cache';
import { disposeBlurEffect } from '@beam/runtime/composition/effects/blur-effect';
import { disposeGpuShapes } from '@beam/runtime/composition/shape/ordered-gpu-shapes';
import {
  disposeCompositionRenderer,
  renderCompositionFrame,
  type RenderableMedia,
} from '@beam/runtime/rendering/render';
import type { ExportRequest } from '@beam/encoder/export-types';
import type { ExportAssets } from '@beam/encoder/mediabunny/export-worker-assets';
import { WATERMARK_LOGO_KEY } from '@beam/runtime/rendering/watermark-render';

const abortIfNeeded = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException('Export cancelled.', 'AbortError');
};

function* clipTimestamps(clip: VisualClip, totalFrames: number, fps: number, first: number) {
  const firstFrame = Math.max(first, Math.floor((clip.timelineStartMs * fps) / 1_000));
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

  constructor(sink: VideoSampleSink, duration: number, totalFrames: number, fps: number) {
    this.sink = sink;
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
  context: Canvas2DContext,
  mediaOutput: VideoFrameWriter,
  signal: AbortSignal,
  onFrame: (done: number, stats: Omit<VideoPipelineStats, 'elapsedMs'>) => void | Promise<void>,
  frameSources: ReadonlyMap<string, FrameSource> = new Map(),
  range?: ExportFrameRange,
): Promise<VideoPipelineStats> {
  engineMetrics.reset();
  const started = performance.now();
  let decodeMs = 0;
  let renderMs = 0;
  let encoderBackpressureMs = 0;
  const fps = request.snapshot.render.fps;
  const totalFrames = Math.max(1, Math.ceil(request.snapshot.duration * fps));
  const firstFrame = range?.first ?? 0,
    endFrame = range?.end ?? totalFrames;
  if (
    !Number.isSafeInteger(firstFrame) ||
    !Number.isSafeInteger(endFrame) ||
    firstFrame < 0 ||
    firstFrame >= endFrame ||
    endFrame > totalFrames
  )
    throw new RangeError('Invalid render frame range.');
  const consumers = new Map<string, AsyncIterator<VideoSample | null>>();
  const sharedConsumers = new Map<string, AsyncIterator<VideoSample | null>>();
  let backgroundReader: BackgroundVideoReader | null = null;
  try {
    for (const clip of compileSceneComposition(request.snapshot.composition).clips) {
      if (
        !isVisualClip(clip) ||
        clip.kind === 'image' ||
        !mayBeEnabled(request.snapshot.composition, clip) ||
        clip.timelineDurationMs <= 0
      )
        continue;
      const track = assets.assets.get(clip.assetId)?.video;
      if (!track) continue;
      const key = playbackVideoDecodeKey({
        clipId: clip.id,
        assetId: clip.assetId,
        timelineStartSeconds: clip.timelineStartMs / 1000,
        timelineDurationSeconds: clip.timelineDurationMs / 1000,
        sourceInSeconds: clip.sourceInMs / 1000,
        playbackRate: clip.playbackRate,
        freezeFrameSourceSeconds: clip.freezeFrameSourceMs === undefined ? undefined : clip.freezeFrameSourceMs / 1000,
      });
      let consumer = sharedConsumers.get(key);
      if (!consumer) {
        consumer = new VideoSampleSink(track, softwareLinuxDecoderOptions(await track.getCodec(), navigator.userAgent))
          .samplesAtTimestamps(clipTimestamps(clip, endFrame, fps, firstFrame), { skipLiveWait: true })
          [Symbol.asyncIterator]();
        sharedConsumers.set(key, consumer);
      }
      consumers.set(clip.id, consumer);
    }
    const background = assets.assets.get('export-background');
    if (background?.video && background.duration > 0)
      backgroundReader = new BackgroundVideoReader(
        new VideoSampleSink(
          background.video,
          softwareLinuxDecoderOptions(await background.video.getCodec(), navigator.userAgent),
        ),
        background.duration,
        totalFrames,
        fps,
      );

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

    const sceneAt = createCompositionSceneLayerResolver(request.snapshot.composition);
    for (let frame = firstFrame; frame < endFrame; frame += 1) {
      abortIfNeeded(signal);
      const time = frame / fps;
      const layers = sceneAt(time * 1_000);
      const activeVisuals = [...layers.cameraVisuals, ...layers.webcams];
      const samples: VideoSample[] = [];
      const leasedFrames: FrameLease[] = [];
      const decoded: Array<{ clip: VisualClip; sample: VideoSample }> = [];
      const sharedSamples = new Map<AsyncIterator<VideoSample | null>, VideoSample | null>();
      const visuals = new Map<string, RenderableMedia>();
      const watermarkLogo = images.get(WATERMARK_LOGO_KEY);
      if (watermarkLogo) visuals.set(WATERMARK_LOGO_KEY, watermarkLogo);
      let screen: RenderableMedia | null = null;
      const decodeStarted = performance.now();
      try {
        for (const clip of activeVisuals) {
          const provider = frameSources.get(clip.assetId);
          if (provider) {
            const sourceTime = sourceTimeAt(clip, time * 1000);
            if (sourceTime !== null) {
              const lease = await provider.frameAt(sourceTime, signal);
              leasedFrames.push(lease);
              visuals.set(clip.id, lease.media);
              if (clip.id === layers.screen?.id) screen = lease.media;
            }
            continue;
          }
          if (clip.kind === 'image') {
            const image = images.get(clip.assetId);
            if (image) visuals.set(clip.id, image);
            continue;
          }
          const consumer = consumers.get(clip.id);
          if (!consumer) continue;
          if (!sharedSamples.has(consumer)) {
            const result = await consumer.next();
            const sample = result.done ? null : result.value;
            sharedSamples.set(consumer, sample);
            if (sample) samples.push(sample);
          }
          const sample = sharedSamples.get(consumer);
          if (!sample) continue;
          decoded.push({ clip, sample });
        }
        const dynamicBackground = await backgroundReader?.next(frame);
        if (dynamicBackground) samples.push(dynamicBackground);
        const renderedSamples = new Map<VideoSample, RenderableMedia>();
        for (const { clip, sample } of decoded) {
          const media = renderedSamples.get(sample) ?? {
            source: sample.toCanvasImageSource(),
            width: sample.displayWidth,
            height: sample.displayHeight,
          };
          renderedSamples.set(sample, media);
          if (clip.id === layers.screen?.id) screen = media;
          visuals.set(clip.id, media);
        }
        const backgroundMedia = dynamicBackground
          ? {
              source: dynamicBackground.toCanvasImageSource(),
              width: dynamicBackground.displayWidth,
              height: dynamicBackground.displayHeight,
            }
          : staticBackground;
        const decodeElapsed = performance.now() - decodeStarted;
        decodeMs += decodeElapsed;
        engineMetrics.observe('decode', decodeElapsed);
        await mediaOutput.prepareVideo?.(frame);
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
        const renderElapsed = performance.now() - renderStarted;
        renderMs += renderElapsed;
        engineMetrics.observe('render', renderElapsed);
      } finally {
        for (const sample of samples) sample.close();
        for (const lease of leasedFrames) lease.close();
      }
      const encoderStarted = performance.now();
      await mediaOutput.addVideo(time, Math.min(1 / fps, Math.max(0, request.snapshot.duration - time)));
      const encodeElapsed = performance.now() - encoderStarted;
      encoderBackpressureMs += encodeElapsed;
      engineMetrics.observe('encode-wait', encodeElapsed);
      engineMetrics.count('frames');
      await onFrame(frame + 1, { decodeMs, renderMs, encoderBackpressureMs });
    }
    mediaOutput.closeVideo();
    return {
      elapsedMs: performance.now() - started,
      decodeMs,
      renderMs,
      encoderBackpressureMs,
      engine: engineMetrics.snapshot(),
    };
  } finally {
    disposeGpuShapes(context);
    disposeMediaShadowCache(context);
    disposeBlurEffect(context);
    disposeCompositionRenderer();
    await Promise.allSettled([
      ...[...sharedConsumers.values()].map((consumer) => consumer.return?.()),
      backgroundReader?.close(),
    ]);
  }
}

export async function renderExportAudio(
  request: ExportRequest,
  assets: ExportAssets,
  clips: readonly AudioClip[],
  mediaOutput: AudioFrameWriter,
  signal: AbortSignal,
  onBlock: (done: number, total: number, stats: { elapsedMs: number; realtimeSpeed: number }) => void,
) {
  if (!clips.length) return null;
  const tracks = new Map(
    [...assets.assets].flatMap(([id, asset]) => (asset.audio ? [[id, asset.audio] as const] : [])),
  );
  const compiled = compileSceneComposition(request.snapshot.composition);
  const ids = new Set(clips.map((clip) => clip.id));
  const mixer = createProgressiveAudioMixer(
    compiled.clips.filter((clip): clip is AudioClip => clip.kind === 'audio' && ids.has(clip.id)),
    tracks,
    request.snapshot.duration,
    request.snapshot.composition,
  );
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
