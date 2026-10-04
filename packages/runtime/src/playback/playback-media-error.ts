import { MediaInputError, type MediaError } from '../shared/media-types';

export function playbackMediaError(error: unknown, sourceId: string): MediaError {
  return error instanceof MediaInputError
    ? error.detail
    : { kind: 'decode-failure', sourceId, message: error instanceof Error ? error.message : 'Playback failed.' };
}
