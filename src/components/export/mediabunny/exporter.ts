import { bitrateFor } from '../export-presets';
import type { ExportProgress, ExportRequest, ExportResult } from '../export-types';
import { renderCompositionFrame, type RenderableMedia } from '../composition/render';
import { activeClipsAt, inspectMedia, mediaSourceDescriptor, sourceTimeAt, type MediaFrame } from '~/media/shared';
import { isAudioClip, isVisualClip, type MediaAsset, type VisualClip } from '~/media/shared/composition-types';
import {
  StreamingMediaOutput,
  VideoFrameProvider,
  findExportAudioCodec,
  findExportVideoCodec,
  mixCompositionAudio,
} from '~/media/export';
import { cursorTypeForKind, useCursorReplacer } from '../../video-editor/properties/cursor/useCursorReplacer';
import { createCursorMotionPlayer } from '../../video-editor/composables/cursor-motion';
import { tNamespace } from '../../../i18n';

const $t = tNamespace('exporter');

export const supportedVideoCodec = (request: ExportRequest) =>
  findExportVideoCodec(request.format, {
    width: request.snapshot.canvas.width,
    height: request.snapshot.canvas.height,
    bitrate: bitrateFor(
      request.preset,
      request.snapshot.canvas.width,
      request.snapshot.canvas.height,
      request.snapshot.render.fps,
    ),
  });

export async function supportedAudioCodec(request: ExportRequest) {
  if (!request.snapshot.composition.clips.some((clip) => isAudioClip(clip) && clip.enabled)) return null;
  return findExportAudioCodec(request.format, { sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000 });
}

export const renderMixedAudio = (request: ExportRequest): Promise<AudioBuffer | null> =>
  mixCompositionAudio(request.snapshot.composition, request.snapshot.duration);

const loadImage = (src: string, errorMessage: string) =>
  new Promise<RenderableMedia>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error(errorMessage));
    image.src = src;
  });

const clipTimestamps = (clip: VisualClip, times: readonly number[]) => {
  const first = clip.sourceInMs / 1_000;
  const last = Math.max(first, (clip.sourceInMs + clip.sourceDurationMs) / 1_000 - 0.000_001);
  return times.map((time) => {
    const sourceMs = sourceTimeAt(clip, time * 1_000);
    if (sourceMs !== null) return sourceMs / 1_000;
    return time * 1_000 < clip.timelineStartMs ? first : last;
  });
};

type LoadedVisuals = {
  images: Map<string, RenderableMedia>;
  providers: Map<string, VideoFrameProvider>;
  backgroundImage: RenderableMedia | null;
  backgroundProvider: VideoFrameProvider | null;
  dispose(): void;
};

async function loadVisuals(request: ExportRequest, times: readonly number[]): Promise<LoadedVisuals> {
  const composition = request.snapshot.composition;
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]));
  const images = new Map<string, RenderableMedia>();
  const providers = new Map<string, VideoFrameProvider>();
  let backgroundImage: RenderableMedia | null = null;
  let backgroundProvider: VideoFrameProvider | null = null;
  try {
    await Promise.all(
      composition.assets
        .filter((asset) => asset.kind === 'image' && asset.src)
        .map(async (asset) => {
          if (/\.gif(?:$|[?#])/i.test(asset.src)) throw new Error($t('gifNotExportable'));
          images.set(asset.id, await loadImage(asset.src, $t('unableToLoadImage', { name: asset.name })));
        }),
    );
    await Promise.all(
      composition.clips
        .filter(
          (clip): clip is VisualClip =>
            isVisualClip(clip) && clip.kind !== 'image' && clip.enabled && Boolean(assets.get(clip.assetId)?.src),
        )
        .map(async (clip) => {
          const asset = assets.get(clip.assetId);
          if (!asset?.src) throw new Error($t('unableToReadVideoSource', { src: clip.name }));
          const provider = await VideoFrameProvider.create(
            { ...mediaSourceDescriptor(asset), kind: 'video' },
            clipTimestamps(clip, times),
          );
          providers.set(clip.id, provider);
        }),
    );

    const background = request.snapshot.background;
    if (background?.kind === 'image') {
      backgroundImage = await loadImage(background.src, $t('unableToLoadBackground'));
    } else if (background?.kind === 'video') {
      const asset: MediaAsset = {
        id: 'export-background',
        kind: 'video',
        name: 'Background',
        fileName: null,
        durationMs: 0,
        width: null,
        height: null,
        src: background.src,
        origin: 'project',
      };
      const descriptor = mediaSourceDescriptor(asset);
      const inspection = await inspectMedia(descriptor);
      const duration = inspection.metadata.durationSeconds;
      if (!(duration > 0)) throw new Error($t('unableToLoadBackground'));
      backgroundProvider = await VideoFrameProvider.create(
        descriptor,
        times.map((time) => time % duration),
      );
    }
    return {
      images,
      providers,
      backgroundImage,
      backgroundProvider,
      dispose: () => {
        for (const provider of providers.values()) provider.dispose();
        backgroundProvider?.dispose();
      },
    };
  } catch (error) {
    for (const provider of providers.values()) provider.dispose();
    backgroundProvider?.dispose();
    throw error;
  }
}

async function loadCursorImages(request: ExportRequest) {
  const types = new Set(
    request.snapshot.cursorSettings.selectedCursor === 'automatic'
      ? request.snapshot.cursor.events
          .filter((event) => event.event === 'shape')
          .map((event) => cursorTypeForKind(event.cursorKind))
      : [request.snapshot.cursorSettings.selectedCursor],
  );
  if (!types.size) types.add('default');
  const { getCursorImage } = useCursorReplacer();
  return new Map(
    await Promise.all(
      [...types].map(
        async (type) =>
          [
            type,
            await getCursorImage(type, request.snapshot.cursorSettings.size * 6, request.snapshot.cursorSettings.color),
          ] as const,
      ),
    ),
  );
}

const renderableFrame = (frame: MediaFrame): RenderableMedia => ({
  source: frame.bitmap,
  width: frame.width,
  height: frame.height,
});

export async function exportWithMediabunny(
  request: ExportRequest,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  const fps = request.snapshot.render.fps;
  const codec = await supportedVideoCodec(request);
  if (!codec) throw new Error($t('formatNotEncodable', { format: request.format.toUpperCase() }));
  const audioCodec = await supportedAudioCodec(request);
  if (request.snapshot.composition.clips.some((clip) => isAudioClip(clip) && clip.enabled) && !audioCodec) {
    throw new Error($t('formatAudioNotEncodable', { format: request.format.toUpperCase() }));
  }
  if (signal.aborted) throw new DOMException($t('exportCancelled'), 'AbortError');
  const opened = await window.capture?.beginExport({ projectName: request.projectName, format: request.format });
  if (!opened || opened.canceled) throw new DOMException($t('exportCancelled'), 'AbortError');

  let loaded: LoadedVisuals | null = null;
  let output: StreamingMediaOutput | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = request.snapshot.canvas.width;
    canvas.height = request.snapshot.canvas.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error($t('canvas2DUnavailable'));
    let sequence = 0;
    const writable = new WritableStream({
      write: (chunk: { data: Uint8Array; position: number }) =>
        window.capture!.writeExportChunk({
          jobId: opened.jobId,
          sequence: sequence++,
          data: chunk.data,
          position: chunk.position,
        }),
    });
    output = new StreamingMediaOutput({
      format: request.format,
      canvas,
      writable,
      videoCodec: codec,
      videoBitrate: bitrateFor(request.preset, canvas.width, canvas.height, fps),
      frameRate: fps,
      audioCodec,
    });

    const totalTimeMs = Math.round(request.snapshot.duration * 1_000);
    const total = Math.max(1, Math.ceil(request.snapshot.duration * fps));
    const times = Array.from({ length: total }, (_, frame) => Math.min(request.snapshot.duration, frame / fps));
    onProgress({
      stage: 'loading_assets',
      stageLabel: $t('loadingMediaAssets'),
      completed: 0,
      total,
      currentTimeMs: 0,
      totalTimeMs,
    });
    const cursorImages = await loadCursorImages(request);
    const cursorMotionPlayer = createCursorMotionPlayer(
      request.snapshot.cursor.events,
      request.snapshot.cursorSettings.motion,
      request.snapshot.render.sourceWidth,
      request.snapshot.render.sourceHeight,
    );
    loaded = await loadVisuals(request, times);
    onProgress({
      stage: 'audio_mixing',
      stageLabel: $t('mixingAudioTracks'),
      completed: 0,
      total,
      currentTimeMs: 0,
      totalTimeMs,
    });
    const mixed = await renderMixedAudio(request);
    await output.start(mixed);

    for (let frameIndex = 0; frameIndex < total; frameIndex += 1) {
      if (signal.aborted) throw new DOMException($t('exportCancelled'), 'AbortError');
      const time = times[frameIndex]!;
      const currentTimeMs = Math.round(time * 1_000);
      onProgress({
        stage: 'encoding',
        stageLabel: $t('encodingFrame', { frame: frameIndex + 1, total }),
        completed: frameIndex + 1,
        total,
        currentTimeMs,
        totalTimeMs,
      });
      const active = activeClipsAt(request.snapshot.composition, currentTimeMs);
      const videoFrames: MediaFrame[] = [];
      let backgroundFrame: MediaFrame | null = null;
      try {
        const visuals = new Map<string, RenderableMedia>();
        let screen: RenderableMedia | null = null;
        for (const clip of active) {
          if (!isVisualClip(clip)) continue;
          if (clip.kind === 'image') {
            const image = loaded.images.get(clip.assetId);
            if (!image) continue;
            visuals.set(clip.id, image);
            continue;
          }
          const provider = loaded.providers.get(clip.id);
          if (!provider) continue;
          const frame = await provider.frameAt(frameIndex);
          videoFrames.push(frame);
          const media = renderableFrame(frame);
          if (clip.kind === 'screen') screen = media;
          else visuals.set(clip.id, media);
        }
        let background = loaded.backgroundImage;
        if (loaded.backgroundProvider) {
          backgroundFrame = await loaded.backgroundProvider.frameAt(frameIndex);
          background = renderableFrame(backgroundFrame);
        }
        renderCompositionFrame(
          context,
          screen,
          request.snapshot,
          time,
          background,
          cursorImages,
          visuals,
          cursorMotionPlayer,
        );
      } finally {
        for (const frame of videoFrames) frame.close();
        backgroundFrame?.close();
      }
      await output.addVideoFrame(time, 1 / fps);
    }

    onProgress({
      stage: 'finalizing',
      stageLabel: $t('finalizingMediaFile'),
      completed: total,
      total,
      currentTimeMs: totalTimeMs,
      totalTimeMs,
    });
    await output.finalize();
    const result = await window.capture!.finalizeExport(opened.jobId);
    return { path: result.path, format: request.format };
  } catch (error) {
    await output?.cancel().catch(() => undefined);
    await window.capture!.abortExport(opened.jobId).catch(() => undefined);
    throw error;
  } finally {
    loaded?.dispose();
  }
}
