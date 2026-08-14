import { BlobSource, Input, UnsupportedInputFormatError } from 'mediabunny';
import { EDITOR_INPUT_FORMATS } from './media-input';
import { MediaInputError, type DroppedMediaInspection } from './media-types';

const BLOB_CACHE_BYTES = 16 * 2 ** 20;
const IMAGE_DURATION_MS = 5_000;

const usableDurationMs = (seconds: number | null, sourceId: string) => {
  const milliseconds = Math.round((seconds ?? 0) * 1_000);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    throw new MediaInputError({
      kind: 'empty',
      sourceId,
      message: 'The media has no usable duration.',
    });
  }
  return milliseconds;
};

async function inspectImage(file: File, sourceId: string): Promise<DroppedMediaInspection> {
  if (typeof createImageBitmap !== 'function') {
    throw new MediaInputError({ kind: 'decode-failure', sourceId, message: 'Image decoding is unavailable.' });
  }
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width <= 0 || bitmap.height <= 0) throw new Error('Invalid image dimensions.');
    return {
      kind: 'image',
      durationMs: IMAGE_DURATION_MS,
      width: bitmap.width,
      height: bitmap.height,
      hasAudio: false,
      canDecodeAudio: false,
      audioCodec: null,
    };
  } catch {
    throw new MediaInputError({
      kind: 'invalid-container',
      sourceId,
      message: 'The dropped file is not a supported image or media container.',
    });
  } finally {
    bitmap?.close();
  }
}

export async function inspectDroppedMedia(file: File, sourceId = file.name): Promise<DroppedMediaInspection> {
  if (!(file instanceof File) || file.size <= 0) {
    throw new MediaInputError({ kind: 'empty', sourceId, message: 'The dropped file is empty.' });
  }

  const input = new Input({
    source: new BlobSource(file, { maxCacheSize: BLOB_CACHE_BYTES }),
    formats: EDITOR_INPUT_FORMATS,
  });
  try {
    try {
      await input.getFormat();
    } catch (error) {
      if (error instanceof UnsupportedInputFormatError) return await inspectImage(file, sourceId);
      throw error;
    }

    const [videoTrack, audioTrack, durationFromMetadata] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
      input.getDurationFromMetadata(),
    ]);
    if (!videoTrack && !audioTrack) {
      throw new MediaInputError({ kind: 'empty', sourceId, message: 'The media has no audio or video track.' });
    }
    const durationMs = usableDurationMs(
      durationFromMetadata ?? (await input.computeDuration([videoTrack, audioTrack].filter((track) => track !== null))),
      sourceId,
    );

    if (videoTrack) {
      const [canDecodeVideo, videoCodec, width, height, canDecodeAudio, audioCodec] = await Promise.all([
        videoTrack.canDecode(),
        videoTrack.getCodec(),
        videoTrack.getDisplayWidth(),
        videoTrack.getDisplayHeight(),
        audioTrack?.canDecode() ?? false,
        audioTrack?.getCodec() ?? null,
      ]);
      if (!canDecodeVideo) {
        throw new MediaInputError({
          kind: 'unsupported-codec',
          sourceId,
          track: 'video',
          codec: videoCodec,
          message: 'The video codec is not supported by this device.',
        });
      }
      return {
        kind: 'video',
        durationMs,
        width,
        height,
        hasAudio: Boolean(audioTrack),
        canDecodeAudio,
        audioCodec,
      };
    }

    const [canDecodeAudio, audioCodec] = await Promise.all([audioTrack!.canDecode(), audioTrack!.getCodec()]);
    if (!canDecodeAudio) {
      throw new MediaInputError({
        kind: 'unsupported-codec',
        sourceId,
        track: 'audio',
        codec: audioCodec,
        message: 'The audio codec is not supported by this device.',
      });
    }
    return {
      kind: 'audio',
      durationMs,
      width: null,
      height: null,
      hasAudio: true,
      canDecodeAudio: true,
      audioCodec,
    };
  } catch (error) {
    if (error instanceof MediaInputError) throw error;
    throw new MediaInputError({
      kind: 'decode-failure',
      sourceId,
      message: 'The dropped media could not be decoded.',
      cause: error,
    });
  } finally {
    input.dispose();
  }
}

export { BLOB_CACHE_BYTES, IMAGE_DURATION_MS };
