import type { AudioClip } from '~/media/shared/composition-types';

export interface ImportedAudioTimelineTrack {
  id: string;
  clips: AudioClip[];
  representative: AudioClip;
}

export function groupImportedAudioTimelineTracks(clips: AudioClip[]): ImportedAudioTimelineTrack[] {
  const grouped = new Map<string, AudioClip[]>();
  for (const clip of clips) {
    const track = grouped.get(clip.assetId);
    if (track) track.push(clip);
    else grouped.set(clip.assetId, [clip]);
  }
  return [...grouped.entries()].map(([id, trackClips]) => ({
    id,
    clips: trackClips,
    representative: trackClips[0]!,
  }));
}
