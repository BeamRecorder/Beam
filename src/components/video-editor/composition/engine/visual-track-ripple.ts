import { isCompositingClip, type Clip } from '~/media/shared/composition-types';

export function downstreamVisualTrackRippleIds(clips: Clip[], editedIds: Set<string>, boundaryMs: number): Set<string> {
  const trackIds = new Set(
    clips.flatMap((clip) => (editedIds.has(clip.id) && isCompositingClip(clip) && clip.trackId ? [clip.trackId] : [])),
  );
  const direct = clips.filter(
    (clip) =>
      !editedIds.has(clip.id) &&
      clip.timelineStartMs >= boundaryMs &&
      isCompositingClip(clip) &&
      clip.trackId !== undefined &&
      trackIds.has(clip.trackId),
  );
  const directIds = new Set(direct.map((clip) => clip.id));
  const linkedGroupIds = new Set(direct.flatMap((clip) => (clip.groupId ? [clip.groupId] : [])));
  return new Set(
    clips.flatMap((clip) =>
      !editedIds.has(clip.id) &&
      clip.timelineStartMs >= boundaryMs &&
      (directIds.has(clip.id) || (clip.groupId && linkedGroupIds.has(clip.groupId)))
        ? [clip.id]
        : [],
    ),
  );
}
