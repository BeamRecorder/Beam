import { CanvasSink, type WrappedCanvas } from 'mediabunny';
import type { OpenedMediaInput } from '../shared';
import type { PlaybackClipDescriptor } from './playback-types';
import { playbackPreviewDimensions, type PreviewQuality } from './playback-preview';

export const PLAYBACK_DECODER_OPTIONS = {
  hardwareAcceleration: 'prefer-hardware' as const,
  optimizeForLatency: true,
};
export const PLAYBACK_TICK_PRELOAD_SECONDS = 0.12;

export type QueuedFrame = {
  bitmap: ImageBitmap;
  timestampSeconds: number;
  durationSeconds: number;
};

export type AssetDecoder = {
  assetId: string;
  opened: OpenedMediaInput;
  sinkTrack: Awaited<ReturnType<OpenedMediaInput['input']['getPrimaryVideoTrack']>>;
  displayWidth: number;
  displayHeight: number;
  decoderOptions?: typeof PLAYBACK_DECODER_OPTIONS;
};

export type ClipConsumer = {
  clip: PlaybackClipDescriptor;
  asset: AssetDecoder;
  sink: CanvasSink;
  iterator: AsyncIterator<WrappedCanvas> | null;
  queue: QueuedFrame[];
  iteratorGeneration: number;
  lastTargetSeconds: number | null;
};

export const createPlaybackSink = (asset: AssetDecoder, quality: PreviewQuality) => {
  const preview = playbackPreviewDimensions(asset.displayWidth, asset.displayHeight, quality);
  return new CanvasSink(asset.sinkTrack!, {
    width: preview.width,
    height: preview.height,
    fit: 'contain',
    poolSize: 3,
    ...(asset.decoderOptions ? { decoderOptions: asset.decoderOptions } : {}),
  });
};

export const createPlaybackConsumer = (
  clip: PlaybackClipDescriptor,
  asset: AssetDecoder,
  quality: PreviewQuality,
): ClipConsumer => ({
  clip,
  asset,
  sink: createPlaybackSink(asset, quality),
  iterator: null,
  queue: [],
  iteratorGeneration: 0,
  lastTargetSeconds: null,
});

export function disposeLoadedAssets(loadedAssets: Map<string, AssetDecoder>, current?: OpenedMediaInput) {
  current?.dispose();
  for (const asset of loadedAssets.values()) asset.opened.dispose();
  loadedAssets.clear();
}

export const activeAt = (clip: PlaybackClipDescriptor, timelineSeconds: number) =>
  timelineSeconds >= clip.timelineStartSeconds &&
  timelineSeconds < clip.timelineStartSeconds + clip.timelineDurationSeconds;

export const sourceTime = (clip: PlaybackClipDescriptor, timelineSeconds: number) =>
  clip.freezeFrameSourceSeconds ??
  clip.sourceInSeconds + (timelineSeconds - clip.timelineStartSeconds) * clip.playbackRate;

export const shouldDecodeTickFrame = (consumer: ClipConsumer, targetSeconds: number) =>
  consumer.lastTargetSeconds !== targetSeconds;

export function activeConsumersForTick(consumers: Iterable<ClipConsumer>, timelineSeconds: number, preloadSeconds = 0) {
  const active: ClipConsumer[] = [];
  for (const consumer of consumers) {
    const startsIn = consumer.clip.timelineStartSeconds - timelineSeconds;
    if (activeAt(consumer.clip, timelineSeconds) || (startsIn > 0 && startsIn <= preloadSeconds)) {
      active.push(consumer);
    } else {
      consumer.lastTargetSeconds = null;
    }
  }
  return active;
}
