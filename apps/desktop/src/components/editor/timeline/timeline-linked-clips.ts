import type { Clip, ClipComposition } from '@beam/engine/shared/composition-types';
import { recordingLinkedClipIds } from '@beam/engine/composition/recording-media-links';

export const linkedClipNames = (composition: ClipComposition, clip: Clip): string[] => {
  const ids = new Set(recordingLinkedClipIds(composition, [clip.id]));
  return composition.clips
    .filter((entry) => entry.id !== clip.id && ids.has(entry.id))
    .map((entry) => `${entry.name} (${(entry.timelineStartMs / 1_000).toFixed(1)}s)`);
};

export function createTimelineLinkedClipNameResolver(composition: ClipComposition) {
  const names = new Map<string, string[]>();
  return (clip: Clip): string[] => {
    const cached = names.get(clip.id);
    if (cached) return cached;
    const value = linkedClipNames(composition, clip);
    names.set(clip.id, value);
    return value;
  };
}
