import { clipEndMs, isCompositingClip, type Clip } from '@beam/engine/shared/composition-types';

const boundary = (values: number[], time: number, inclusive: boolean) => {
  let low = 0,
    high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]! < time || (inclusive && values[middle] === time)) low = middle + 1;
    else high = middle;
  }
  return low;
};

/** Resolve collision limits in O(N log N), even for thousands of moved fragments in one lane. */
export function visualMoveDeltaBounds(clips: Clip[], movedIds: Set<string>): { min: number; max: number } {
  let min = -Infinity,
    max = Infinity;
  const starts = new Map<string, number[]>(),
    ends = new Map<string, number[]>();
  for (const clip of clips) {
    if (!isCompositingClip(clip) || movedIds.has(clip.id)) continue;
    const track = clip.trackId!;
    if (!starts.has(track)) {
      starts.set(track, []);
      ends.set(track, []);
    }
    starts.get(track)!.push(clip.timelineStartMs);
    ends.get(track)!.push(clipEndMs(clip));
  }
  for (const values of [...starts.values(), ...ends.values()]) values.sort((a, b) => a - b);
  for (const clip of clips) {
    if (!movedIds.has(clip.id) || !isCompositingClip(clip)) continue;
    const trackStarts = starts.get(clip.trackId!) ?? [],
      trackEnds = ends.get(clip.trackId!) ?? [];
    const previous = trackEnds[boundary(trackEnds, clip.timelineStartMs, true) - 1] ?? 0;
    const next = trackStarts[boundary(trackStarts, clipEndMs(clip), false)] ?? Infinity;
    min = Math.max(min, -clip.timelineStartMs, previous - clip.timelineStartMs);
    max = Math.min(max, next - clipEndMs(clip));
  }
  return { min, max };
}
