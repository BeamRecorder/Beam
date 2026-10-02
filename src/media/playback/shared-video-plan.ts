import type { PlaybackClipDescriptor } from './playback-types';

/** Share pixels only when source identity and the complete timeline mapping are identical. */
export const playbackVideoDecodeKey = (clip: PlaybackClipDescriptor): string =>
  JSON.stringify([
    clip.assetId,
    clip.timelineStartSeconds,
    clip.timelineDurationSeconds,
    clip.sourceInSeconds,
    clip.playbackRate,
    clip.freezeFrameSourceSeconds ?? null,
  ]);

export function sharedVideoPlan(clips: readonly PlaybackClipDescriptor[]) {
  const leaders = new Map<string, PlaybackClipDescriptor>();
  const aliases = new Map<string, string>();
  for (const clip of clips) {
    const key = playbackVideoDecodeKey(clip);
    let leader = leaders.get(key);
    if (!leader) {
      leader = clip;
      leaders.set(key, clip);
    }
    aliases.set(clip.clipId, leader.clipId);
  }
  return { clips: [...leaders.values()], aliases };
}
