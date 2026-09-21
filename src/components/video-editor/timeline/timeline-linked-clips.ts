import type { Clip, ClipComposition } from '~/media/shared/composition-types';
import { recordingLinkedClipIds } from '../composition/recording-media-links';

export const linkedClipNames = (composition: ClipComposition, clip: Clip): string[] => {
  const ids = new Set(recordingLinkedClipIds(composition, [clip.id]));
  return composition.clips
    .filter((entry) => entry.id !== clip.id && ids.has(entry.id))
    .map((entry) => `${entry.name} (${(entry.timelineStartMs / 1_000).toFixed(1)}s)`);
};
