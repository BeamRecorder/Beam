import { CanvasSink, type WrappedCanvas } from 'mediabunny';
import type { OpenedMediaInput } from '../shared';
import type { PlaybackClipDescriptor } from './playback-types';

export const PLAYBACK_DECODER_OPTIONS = {
  hardwareAcceleration: 'prefer-hardware' as const,
  optimizeForLatency: true,
};

export type QueuedFrame = {
  bitmap: ImageBitmap;
  timestampSeconds: number;
  durationSeconds: number;
};

export type AssetDecoder = {
  assetId: string;
  opened: OpenedMediaInput;
  sinkTrack: Awaited<ReturnType<OpenedMediaInput['input']['getPrimaryVideoTrack']>>;
  previewWidth: number;
  previewHeight: number;
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

export const createPlaybackConsumer = (clip: PlaybackClipDescriptor, asset: AssetDecoder): ClipConsumer => ({
  clip,
  asset,
  sink: new CanvasSink(asset.sinkTrack!, {
    width: asset.previewWidth,
    height: asset.previewHeight,
    fit: 'contain',
    poolSize: 3,
    ...(asset.decoderOptions ? { decoderOptions: asset.decoderOptions } : {}),
  }),
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
  clip.sourceInSeconds + (timelineSeconds - clip.timelineStartSeconds) * clip.playbackRate;
