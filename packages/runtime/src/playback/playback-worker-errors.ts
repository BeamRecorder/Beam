import { MediaInputError, type MediaError, type MediaErrorContext } from '@beam/runtime/shared/index';
import { sourceTime, type ClipConsumer } from '@beam/runtime/playback/playback-worker-consumers';

const browserError = (value: unknown): value is Error | DOMException =>
  value instanceof Error || (typeof DOMException !== 'undefined' && value instanceof DOMException);

export function playbackMediaError(error: unknown, sourceId: string, context?: MediaErrorContext): MediaError {
  const detail: MediaError =
    error instanceof MediaInputError
      ? error.detail
      : {
          kind: 'decode-failure',
          sourceId,
          message: browserError(error) ? error.message : 'Playback decoding failed.',
        };
  const cause = detail.kind === 'decode-failure' && browserError(detail.cause) ? detail.cause : error;
  return {
    ...detail,
    ...(context
      ? {
          sourceId,
          context: {
            ...context,
            ...(browserError(cause) ? { errorName: cause.name } : {}),
            ...(browserError(cause) && cause.message !== detail.message ? { causeMessage: cause.message } : {}),
            ...detail.context,
          },
        }
      : {}),
  };
}

export async function playbackOperation<T>(
  sourceId: string,
  context: MediaErrorContext,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new MediaInputError(playbackMediaError(error, sourceId, context));
  }
}

export function consumerPlaybackOperation<T>(
  consumer: ClipConsumer,
  operation: MediaErrorContext['operation'],
  timelineSeconds: number | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const { asset, clip } = consumer;
  return playbackOperation(
    asset.assetId,
    {
      operation,
      clipId: clip.clipId,
      ...(timelineSeconds === undefined ? {} : { timelineSeconds, sourceSeconds: sourceTime(clip, timelineSeconds) }),
      codec: asset.decoderConfig.codec,
      codedWidth: asset.decoderConfig.codedWidth,
      codedHeight: asset.decoderConfig.codedHeight,
      hardwareAcceleration: asset.decoderOptions?.hardwareAcceleration ?? 'no-preference',
      ...(asset.decoderOptions ? { optimizeForLatency: asset.decoderOptions.optimizeForLatency } : {}),
    },
    run,
  );
}
