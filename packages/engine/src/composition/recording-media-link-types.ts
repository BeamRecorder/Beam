import type { Clip, VisualClip } from '../shared/composition-types';

export interface RecordingMediaLinkIndex {
  owner(clip: Clip): VisualClip | null;
  linkedIds(selectedIds: readonly string[]): string[];
  linkedClips(clipId: string): readonly Clip[];
}

export interface RecordingScreenScope {
  screens: VisualClip[];
  groups: Map<string, VisualClip>;
}
export interface RecordingClipLink {
  clip: Clip;
  owner: VisualClip | null;
}
