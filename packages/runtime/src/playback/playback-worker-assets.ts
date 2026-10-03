import {
  MediaInputError,
  openMediaInput,
  type MediaErrorContext,
  type MediaSourceDescriptor,
  type OpenedMediaInput,
} from '@beam/runtime/shared/index';
import type { AssetDecoder } from '@beam/runtime/playback/playback-worker-consumers';
import { playbackMediaError } from '@beam/runtime/playback/playback-worker-errors';
import { playbackDecoderOptions } from '@beam/runtime/playback/playback-decoder';

export async function loadPlaybackAsset(
  descriptor: MediaSourceDescriptor,
  isStale: () => boolean,
): Promise<AssetDecoder | null> {
  let current: OpenedMediaInput | null = null;
  let context: MediaErrorContext = { operation: 'open-media' };
  try {
    const opened = await openMediaInput(descriptor);
    current = opened;
    const stopIfStale = () => {
      if (!isStale()) return false;
      opened.dispose();
      return true;
    };
    if (stopIfStale()) return null;
    context = { operation: 'inspect-track' };
    const track = await opened.input.getPrimaryVideoTrack();
    if (stopIfStale()) return null;
    if (!track) {
      throw new MediaInputError({
        kind: 'missing-track',
        sourceId: descriptor.assetId,
        track: 'video',
        message: 'The playback asset has no video track.',
      });
    }
    const codec = await track.getCodec();
    context.codec = codec;
    if (stopIfStale()) return null;
    const canDecode = await track.canDecode();
    if (stopIfStale()) return null;
    if (!canDecode) {
      throw new MediaInputError({
        kind: 'unsupported-codec',
        sourceId: descriptor.assetId,
        track: 'video',
        codec,
        message: 'The playback video codec is unsupported.',
      });
    }
    const decoderConfig = await track.getDecoderConfig();
    context = {
      operation: 'configure-decoder',
      codec: decoderConfig?.codec ?? codec,
      codedWidth: decoderConfig?.codedWidth,
      codedHeight: decoderConfig?.codedHeight,
    };
    const baseConfigSupported =
      typeof VideoDecoder !== 'undefined' &&
      decoderConfig !== null &&
      (await VideoDecoder.isConfigSupported(decoderConfig)).supported;
    if (stopIfStale()) return null;
    if (!decoderConfig || !baseConfigSupported) {
      throw new MediaInputError({
        kind: 'unsupported-codec',
        sourceId: descriptor.assetId,
        track: 'video',
        codec,
        message: 'The playback video decoder configuration is unsupported.',
      });
    }
    const preferredOptions = playbackDecoderOptions(codec, navigator.userAgent);
    context = { ...context, ...preferredOptions };
    const optimizedConfigSupported = (await VideoDecoder.isConfigSupported({ ...decoderConfig, ...preferredOptions }))
      .supported;
    if (stopIfStale()) return null;
    context.operation = 'inspect-track';
    const displayWidth = await track.getDisplayWidth();
    if (stopIfStale()) return null;
    const displayHeight = await track.getDisplayHeight();
    if (stopIfStale()) return null;
    return {
      assetId: descriptor.assetId,
      opened,
      sinkTrack: track,
      displayWidth,
      displayHeight,
      decoderConfig,
      decoderOptions: optimizedConfigSupported ? preferredOptions : undefined,
    };
  } catch (error) {
    current?.dispose();
    throw new MediaInputError(playbackMediaError(error, descriptor.assetId, context));
  }
}
