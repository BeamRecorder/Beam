import {
  clipEndMs,
  isCompositingClip,
  type Clip,
  type ClipComposition,
  type ShapeClip,
} from '@beam/engine/shared/composition-types';

export const isTextElementClip = (clip: Clip): clip is ShapeClip => clip.kind === 'shape' && clip.family === 'text';

/** Reuse only unlocked text-only lanes with room for the complete incoming group. */
export function findTextElementTrack(
  composition: ClipComposition,
  incoming: readonly ShapeClip[],
  preferredTrackId?: string | null,
  excludedTrackIds: ReadonlySet<string> = new Set(),
): ShapeClip | null {
  if (!incoming.length || incoming.some((clip) => !isTextElementClip(clip))) return null;
  const tracks = new Map<string, Clip[]>();
  for (const clip of composition.clips) {
    if (!isCompositingClip(clip) || !clip.trackId || excludedTrackIds.has(clip.trackId)) continue;
    const clips = tracks.get(clip.trackId);
    if (clips) clips.push(clip);
    else tracks.set(clip.trackId, [clip]);
  }
  const available = [...tracks.values()].filter((clips): clips is ShapeClip[] =>
    clips.every(
      (clip) =>
        isTextElementClip(clip) &&
        !clip.locked &&
        incoming.every((next) => next.timelineStartMs >= clipEndMs(clip) || clip.timelineStartMs >= clipEndMs(next)),
    ),
  );
  const startMs = Math.min(...incoming.map((clip) => clip.timelineStartMs));
  const distance = (clips: ShapeClip[]) =>
    clips.reduce(
      (value, clip) => Math.min(value, Math.abs(startMs - clipEndMs(clip)), Math.abs(startMs - clip.timelineStartMs)),
      Infinity,
    );
  available.sort(
    (left, right) =>
      Number(right[0]!.trackId === preferredTrackId) - Number(left[0]!.trackId === preferredTrackId) ||
      distance(left) - distance(right) ||
      left[0]!.order - right[0]!.order ||
      left[0]!.id.localeCompare(right[0]!.id),
  );
  return available[0]?.[0] ?? null;
}
