import { MediaInputError, openMediaInput, type MediaSourceDescriptor } from '../shared';
import { PLAYBACK_DECODER_OPTIONS, type AssetDecoder } from './playback-worker-consumers';

export async function loadPlaybackAsset(
  descriptor: MediaSourceDescriptor,
  isStale: () => boolean,
): Promise<AssetDecoder | null> {
  const opened = await openMediaInput(descriptor);
  const stopIfStale = () => {
    if (!isStale()) return false;
    opened.dispose();
    return true;
  };
  if (stopIfStale()) return null;
  const track = await opened.input.getPrimaryVideoTrack();
  if (stopIfStale()) return null;
  if (!track) {
    opened.dispose();
    throw new MediaInputError({
      kind: 'missing-track',
      sourceId: descriptor.assetId,
      track: 'video',
      message: 'The playback asset has no video track.',
    });
  }
  const codec = await track.getCodec();
  if (stopIfStale()) return null;
  const canDecode = await track.canDecode();
  if (stopIfStale()) return null;
  if (!canDecode) {
    opened.dispose();
    throw new MediaInputError({
      kind: 'unsupported-codec',
      sourceId: descriptor.assetId,
      track: 'video',
      codec,
      message: 'The playback video codec is unsupported.',
    });
  }
  const decoderConfig = await track.getDecoderConfig();
  const baseConfigSupported =
    typeof VideoDecoder !== 'undefined' &&
    decoderConfig !== null &&
    (await VideoDecoder.isConfigSupported(decoderConfig)).supported;
  if (stopIfStale()) return null;
  if (!baseConfigSupported) {
    opened.dispose();
    throw new MediaInputError({
      kind: 'unsupported-codec',
      sourceId: descriptor.assetId,
      track: 'video',
      codec,
      message: 'The playback video decoder configuration is unsupported.',
    });
  }
  const optimizedConfigSupported =
    decoderConfig !== null &&
    (await VideoDecoder.isConfigSupported({ ...decoderConfig, ...PLAYBACK_DECODER_OPTIONS })).supported;
  if (stopIfStale()) return null;
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
    decoderOptions: optimizedConfigSupported ? PLAYBACK_DECODER_OPTIONS : undefined,
  };
}
