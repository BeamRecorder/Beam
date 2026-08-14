import {
  Input,
  InputDisposedError,
  ADTS,
  MATROSKA,
  MP4,
  MP3,
  OGG,
  QTFF,
  UnsupportedInputFormatError,
  WAVE,
  WEBM,
  type InputAudioTrack,
  type InputVideoTrack,
  type UrlSource,
} from 'mediabunny';
import { MediaSourcePool, mediaSourcePool } from './media-source';
import {
  MediaInputError,
  type MediaAudioMetadata,
  type MediaCapabilities,
  type MediaError,
  type MediaInspection,
  type MediaMetadata,
  type MediaSourceDescriptor,
  type MediaVideoMetadata,
  type OpenedMediaInput,
} from './media-types';

export const EDITOR_INPUT_FORMATS = [MP4, QTFF, WEBM, MATROSKA, MP3, WAVE, OGG, ADTS];

function errorDetail(error: unknown, descriptor: MediaSourceDescriptor): MediaError {
  if (error instanceof MediaInputError) return error.detail;
  if (error instanceof UnsupportedInputFormatError) {
    return {
      kind: 'invalid-container',
      sourceId: descriptor.assetId,
      message: 'The media container is invalid or unsupported.',
    };
  }
  if (error instanceof InputDisposedError) {
    return { kind: 'disposed', sourceId: descriptor.assetId, message: 'The media input was disposed.' };
  }
  return {
    kind: 'decode-failure',
    sourceId: descriptor.assetId,
    message: 'The media input could not be decoded.',
    cause: error,
  };
}

export async function openMediaInput(
  descriptor: MediaSourceDescriptor,
  pool: MediaSourcePool = mediaSourcePool,
): Promise<OpenedMediaInput> {
  const lease = pool.acquire(descriptor);
  let input: Input<UrlSource> | null = null;
  try {
    input = new Input({ source: lease.ref, formats: EDITOR_INPUT_FORMATS });
    await input.getFormat();
  } catch (error) {
    if (input) input.dispose();
    else lease.ref.free();
    lease.release();
    throw new MediaInputError(errorDetail(error, descriptor));
  }

  let disposed = false;
  return {
    descriptor,
    input,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      input.dispose();
      lease.release();
    },
  };
}

async function inspectVideoTrack(track: InputVideoTrack): Promise<MediaVideoMetadata> {
  const [codec, codecParameter, codedWidth, codedHeight, displayWidth, displayHeight, rotation, ratio, config, decode] =
    await Promise.all([
      track.getCodec(),
      track.getCodecParameterString(),
      track.getCodedWidth(),
      track.getCodedHeight(),
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      track.getRotation(),
      track.getPixelAspectRatio(),
      track.getDecoderConfig(),
      track.canDecode(),
    ]);
  return {
    trackId: String(track.id),
    codec,
    codecParameter,
    codedWidth,
    codedHeight,
    displayWidth,
    displayHeight,
    rotation,
    pixelAspectRatio: { numerator: ratio.num, denominator: ratio.den },
    decoderConfig: config,
    canDecode: decode,
  };
}

async function inspectAudioTrack(track: InputAudioTrack): Promise<MediaAudioMetadata> {
  const [codec, codecParameter, numberOfChannels, sampleRate, config, decode] = await Promise.all([
    track.getCodec(),
    track.getCodecParameterString(),
    track.getNumberOfChannels(),
    track.getSampleRate(),
    track.getDecoderConfig(),
    track.canDecode(),
  ]);
  return {
    trackId: String(track.id),
    codec,
    codecParameter,
    numberOfChannels,
    sampleRate,
    decoderConfig: config,
    canDecode: decode,
  };
}

function assertUsableSource(
  descriptor: MediaSourceDescriptor,
  metadata: MediaMetadata,
  capabilities: MediaCapabilities,
): void {
  if (!capabilities.hasVideo && !capabilities.hasAudio) {
    throw new MediaInputError({ kind: 'empty', sourceId: descriptor.assetId, message: 'The media has no tracks.' });
  }
  const track = descriptor.kind;
  if (track === 'video' && !capabilities.hasVideo) {
    throw new MediaInputError({
      kind: 'missing-track',
      sourceId: descriptor.assetId,
      track,
      message: 'The media has no video track.',
    });
  }
  if (track === 'audio' && !capabilities.hasAudio) {
    throw new MediaInputError({
      kind: 'missing-track',
      sourceId: descriptor.assetId,
      track,
      message: 'The media has no audio track.',
    });
  }
  const supported = track === 'video' ? capabilities.canDecodeVideo : capabilities.canDecodeAudio;
  if (!supported) {
    const tracks = track === 'video' ? metadata.videoTracks : metadata.audioTracks;
    throw new MediaInputError({
      kind: 'unsupported-codec',
      sourceId: descriptor.assetId,
      track,
      codec: tracks[0]?.codec ?? null,
      message: `The ${track} codec is not supported by this device.`,
    });
  }
}

export async function inspectMedia(
  descriptor: MediaSourceDescriptor,
  options: { requireDecodable?: boolean; pool?: MediaSourcePool } = {},
): Promise<MediaInspection> {
  const opened = await openMediaInput(descriptor, options.pool);
  try {
    const [format, mimeType, durationFromMetadata, videoTracks, audioTracks] = await Promise.all([
      opened.input.getFormat(),
      opened.input.getMimeType(),
      opened.input.getDurationFromMetadata(),
      opened.input.getVideoTracks(),
      opened.input.getAudioTracks(),
    ]);
    const [video, audio] = await Promise.all([
      Promise.all(videoTracks.map(inspectVideoTrack)),
      Promise.all(audioTracks.map(inspectAudioTrack)),
    ]);
    const durationSeconds =
      durationFromMetadata ?? (await opened.input.computeDuration([...videoTracks, ...audioTracks]));
    const metadata: MediaMetadata = {
      container: format.name,
      mimeType,
      durationSeconds,
      videoTracks: video,
      audioTracks: audio,
    };
    const capabilities: MediaCapabilities = {
      hasVideo: video.length > 0,
      hasAudio: audio.length > 0,
      canDecodeVideo: video.some((track) => track.canDecode),
      canDecodeAudio: audio.some((track) => track.canDecode),
    };
    if (options.requireDecodable !== false) assertUsableSource(descriptor, metadata, capabilities);
    return { metadata, capabilities };
  } catch (error) {
    throw new MediaInputError(errorDetail(error, descriptor));
  } finally {
    opened.dispose();
  }
}
