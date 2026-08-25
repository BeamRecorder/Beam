import type { BlurClip, ColorClip, ShapeClip, VisualClip } from '~/media/shared/composition-types';
import type { VisualTimelineTrack } from './timeline-tracks-types';

type CompositingClip = VisualClip | ColorClip | ShapeClip | BlurClip;

export const groupVisualTimelineTracks = (clips: CompositingClip[]): VisualTimelineTrack[] => {
  const grouped = new Map<string, CompositingClip[]>();
  for (const clip of [...clips].sort(
    (left, right) => left.order - right.order || left.timelineStartMs - right.timelineStartMs,
  )) {
    const trackId = clip.trackId!;
    const track = grouped.get(trackId);
    if (track) track.push(clip);
    else grouped.set(trackId, [clip]);
  }
  return [...grouped.entries()].map(([id, trackClips]) => {
    const ordered = trackClips.sort(
      (left, right) => left.timelineStartMs - right.timelineStartMs || left.id.localeCompare(right.id),
    );
    return { id, clips: ordered, representative: ordered[0]!, order: ordered[0]!.order };
  });
};

export const previewVisualTrackOrder = (
  tracks: VisualTimelineTrack[],
  preview: string[] | null,
): VisualTimelineTrack[] => {
  if (!preview) return tracks;
  const byId = new Map(tracks.map((track) => [track.id, track]));
  return [
    ...preview.flatMap((id) => {
      const track = byId.get(id);
      return track ? [track] : [];
    }),
    ...tracks.filter((track) => !preview.includes(track.id)),
  ];
};
