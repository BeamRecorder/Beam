import type { Clip, ClipComposition } from '@beam/engine/shared/composition-types';
import { createRecordingMediaLinkIndex } from '@beam/engine/composition/recording-media-links';

export const linkedClipNames = (composition: ClipComposition, clip: Clip): string[] => {
  return createTimelineLinkedClipNameResolver(composition)(clip);
};

export function createTimelineLinkedClipNameResolver(composition: ClipComposition) {
  const index = createRecordingMediaLinkIndex(composition);
  const names = new Map<string, string[]>();
  return (clip: Clip): string[] => {
    const cached = names.get(clip.id);
    if (cached) return cached;
    const value = index
      .linkedClips(clip.id)
      .filter((entry) => entry.id !== clip.id)
      .map((entry) => `${entry.name} (${(entry.timelineStartMs / 1_000).toFixed(1)}s)`);
    names.set(clip.id, value);
    return value;
  };
}
