import {
  clipEndMs,
  captionLayerKey,
  isCompositingClip,
  isTextCaptionClip,
  type Clip,
  type VisualClip,
  type BlurClip,
} from '~/media/shared/composition-types';

export type CompositingClip = VisualClip | BlurClip;

const byOrderAndTime = (left: Clip, right: Clip) =>
  left.order - right.order || left.timelineStartMs - right.timelineStartMs || left.id.localeCompare(right.id);

/** Canonicalizes clips so every visual track owns one layer order and one contiguous block. */
export const normalizeClipOrders = (clips: Clip[]): Clip[] => {
  const buckets = new Map<string, Clip[]>();
  for (const clip of [...clips].sort(byOrderAndTime)) {
    const key = isCompositingClip(clip)
      ? `track:${clip.trackId}`
      : isTextCaptionClip(clip)
        ? captionLayerKey(clip)
        : `clip:${clip.id}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(clip);
    else buckets.set(key, [clip]);
  }
  return [...buckets.values()].flatMap((bucket, order) =>
    bucket
      .sort((left, right) => left.timelineStartMs - right.timelineStartMs || left.id.localeCompare(right.id))
      .map((clip) => ({ ...clip, order })),
  );
};

export const visualTrackClips = (clips: Clip[], trackId: string): CompositingClip[] =>
  clips
    .filter((clip): clip is CompositingClip => isCompositingClip(clip) && clip.trackId === trackId)
    .sort((left, right) => left.timelineStartMs - right.timelineStartMs || left.id.localeCompare(right.id));

export const assertValidVisualTracks = (clips: Clip[], fail: (message: string) => never): void => {
  const tracks = new Map<string, CompositingClip[]>();
  for (const clip of clips) {
    if (!isCompositingClip(clip)) continue;
    if (typeof clip.trackId !== 'string' || !clip.trackId) fail('Invalid visual track identity.');
    const track = tracks.get(clip.trackId);
    if (track) track.push(clip);
    else tracks.set(clip.trackId, [clip]);
  }
  for (const track of tracks.values()) {
    const order = track[0]!.order;
    if (track.some((clip) => clip.order !== order)) fail('Visual track fragments must share one order.');
    const ordered = [...track].sort(
      (left, right) => left.timelineStartMs - right.timelineStartMs || left.id.localeCompare(right.id),
    );
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index]!.timelineStartMs < clipEndMs(ordered[index - 1]!)) {
        fail('Visual track fragments cannot overlap.');
      }
    }
  }
};

const stationarySiblings = (clips: Clip[], clip: CompositingClip, ignoredIds: Set<string>) =>
  visualTrackClips(clips, clip.trackId!).filter((entry) => !ignoredIds.has(entry.id));

export const visualMoveDeltaBounds = (clips: Clip[], movedIds: Set<string>): { min: number; max: number } => {
  let min = -Infinity;
  let max = Infinity;
  for (const clip of clips) {
    if (!movedIds.has(clip.id) || !isCompositingClip(clip)) continue;
    min = Math.max(min, -clip.timelineStartMs);
    const siblings = stationarySiblings(clips, clip, movedIds);
    const previousEnd = Math.max(
      0,
      ...siblings.filter((entry) => clipEndMs(entry) <= clip.timelineStartMs).map(clipEndMs),
    );
    const nextStart = Math.min(
      Infinity,
      ...siblings.filter((entry) => entry.timelineStartMs >= clipEndMs(clip)).map((entry) => entry.timelineStartMs),
    );
    min = Math.max(min, previousEnd - clip.timelineStartMs);
    max = Math.min(max, nextStart - clipEndMs(clip));
  }
  return { min, max };
};

export const visualTrimBounds = (
  clips: Clip[],
  editedIds: Set<string>,
  edge: 'start' | 'end',
): { min: number; max: number } => {
  let min = edge === 'start' ? 0 : -Infinity;
  let max = Infinity;
  for (const clip of clips) {
    if (!editedIds.has(clip.id) || !isCompositingClip(clip)) continue;
    const siblings = stationarySiblings(clips, clip, editedIds);
    if (edge === 'start') {
      min = Math.max(min, ...siblings.filter((entry) => clipEndMs(entry) <= clip.timelineStartMs).map(clipEndMs));
    } else {
      max = Math.min(
        max,
        ...siblings.filter((entry) => entry.timelineStartMs >= clipEndMs(clip)).map((entry) => entry.timelineStartMs),
      );
    }
  }
  return { min, max };
};

export const maximumVisualTrackDuration = (clips: Clip[], editedIds: Set<string>): number => {
  let maximum = Infinity;
  for (const clip of clips) {
    if (!editedIds.has(clip.id) || !isCompositingClip(clip)) continue;
    const nextStart = Math.min(
      Infinity,
      ...stationarySiblings(clips, clip, editedIds)
        .filter((entry) => entry.timelineStartMs >= clipEndMs(clip))
        .map((entry) => entry.timelineStartMs),
    );
    maximum = Math.min(maximum, nextStart - clip.timelineStartMs);
  }
  return maximum;
};

export const reorderClipOrders = (clips: Clip[], clipId: string, targetIndex: number): Clip[] | null => {
  if (!Number.isInteger(targetIndex)) return null;
  const ordered = normalizeClipOrders(clips);
  const index = ordered.findIndex((clip) => clip.id === clipId);
  if (index < 0) return null;
  const source = ordered[index]!;
  if (!isCompositingClip(source)) {
    const [clip] = ordered.splice(index, 1);
    ordered.splice(Math.max(0, Math.min(ordered.length, targetIndex)), 0, clip!);
    return normalizeClipOrders(ordered.map((entry, order) => ({ ...entry, order })));
  }
  const trackOrders = new Map<string, number>();
  for (const clip of ordered) {
    if (isCompositingClip(clip) && !trackOrders.has(clip.trackId!)) trackOrders.set(clip.trackId!, clip.order);
  }
  const tracks = [...trackOrders].sort((left, right) => left[1] - right[1]);
  const sourceIndex = tracks.findIndex(([trackId]) => trackId === source.trackId!);
  const [track] = tracks.splice(sourceIndex, 1);
  tracks.splice(Math.max(0, Math.min(tracks.length, targetIndex)), 0, track!);
  const orderSlots = [...trackOrders.values()].sort((left, right) => left - right);
  const orderByTrack = new Map(tracks.map(([trackId], trackIndex) => [trackId, orderSlots[trackIndex]!]));
  return normalizeClipOrders(
    ordered.map((clip) => (isCompositingClip(clip) ? { ...clip, order: orderByTrack.get(clip.trackId!)! } : clip)),
  );
};
