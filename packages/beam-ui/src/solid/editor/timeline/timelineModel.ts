import type { ClipPlacement, Project } from '../shared/editorTypes';

/** Stable millisecond timecode for the preview, source ranges, and timeline ruler. */
export function timecode(milliseconds: number): string {
  const time = Number.isFinite(milliseconds) ? Math.max(0, Math.floor(milliseconds)) : 0;
  const total = Math.floor(time / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}.${String(time % 1000).padStart(3, '0')}`;
}
/** Snaps a drag to actual clip edges and the playhead within eight screen pixels. */
export function snapStart(
  value: number,
  clip: ClipPlacement,
  project: Project,
  playhead: number,
  pixelsPerSecond: number,
): number {
  const radius = 8000 / pixelsPerSecond;
  const edges = [
    0,
    playhead,
    ...project.clips.filter((c) => c.id !== clip.id).flatMap((c) => [c.startMs, c.startMs + c.durationMs]),
  ];
  let result = Math.max(0, Math.round(value)),
    distance = radius;
  for (const edge of edges)
    for (const candidate of [edge, edge - clip.durationMs]) {
      const delta = Math.abs(candidate - value);
      if (candidate >= 0 && delta < distance) {
        distance = delta;
        result = candidate;
      }
    }
  return result;
}
/** Keeps viewport work bounded at every timeline magnification. */
export function visibleClips(clips: readonly ClipPlacement[], startMs: number, endMs: number): ClipPlacement[] {
  return clips.filter((c) => c.startMs < endMs && c.startMs + c.durationMs > startMs);
}
