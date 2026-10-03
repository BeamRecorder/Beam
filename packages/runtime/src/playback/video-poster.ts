import { CanvasSink } from 'mediabunny';
import {
  MediaInputError,
  openMediaInput,
  ownedMediaFrame,
  type MediaFrame,
  type MediaSourceDescriptor,
} from '@beam/runtime/shared/index';
import { softwareLinuxDecoderOptions } from '@beam/runtime/playback/playback-decoder';
import type { VideoPosterOptions } from '@beam/runtime/playback/video-poster-types';
export type { VideoPosterOptions } from '@beam/runtime/playback/video-poster-types';

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export async function decodeVideoPoster(
  descriptor: MediaSourceDescriptor,
  options: VideoPosterOptions = {},
): Promise<MediaFrame> {
  if (descriptor.kind !== 'video') {
    throw new MediaInputError({
      kind: 'missing-track',
      sourceId: descriptor.assetId,
      track: 'video',
      message: 'A video poster requires a video source.',
    });
  }
  if (
    options.position !== undefined &&
    (!Number.isFinite(options.position) || options.position < 0 || options.position > 1)
  ) {
    throw new RangeError('Video poster position must be between 0 and 1.');
  }
  if (
    options.timestampSeconds !== undefined &&
    (!Number.isFinite(options.timestampSeconds) || options.timestampSeconds < 0)
  ) {
    throw new RangeError('Video poster timestamp must be a finite positive number.');
  }

  const opened = await openMediaInput(descriptor);
  try {
    const track = await opened.input.getPrimaryVideoTrack();
    if (!track) {
      throw new MediaInputError({
        kind: 'missing-track',
        sourceId: descriptor.assetId,
        track: 'video',
        message: 'The media has no video track.',
      });
    }
    if (!(await track.canDecode())) {
      throw new MediaInputError({
        kind: 'unsupported-codec',
        sourceId: descriptor.assetId,
        track: 'video',
        codec: await track.getCodec(),
        message: 'The video codec is not supported by this device.',
      });
    }
    const duration = await opened.input.computeDuration([track]);
    const requested = options.timestampSeconds ?? duration * (options.position ?? 0.5);
    const timestamp = clamp(requested, 0, Math.max(0, duration - 0.000_001));
    const decoderOptions = softwareLinuxDecoderOptions(await track.getCodec(), navigator.userAgent);
    const sink = new CanvasSink(track, {
      ...(decoderOptions ? { decoderOptions } : {}),
      width: options.width,
      height: options.height,
      fit: options.fit,
      poolSize: 1,
    });
    const wrapped = await sink.getCanvas(timestamp);
    if (!wrapped) {
      throw new MediaInputError({
        kind: 'decode-failure',
        sourceId: descriptor.assetId,
        message: 'No video frame is available for the requested poster.',
      });
    }
    const bitmap =
      'transferToImageBitmap' in wrapped.canvas
        ? wrapped.canvas.transferToImageBitmap()
        : await createImageBitmap(wrapped.canvas);
    return ownedMediaFrame(descriptor.assetId, bitmap, wrapped.timestamp, wrapped.duration);
  } finally {
    opened.dispose();
  }
}
