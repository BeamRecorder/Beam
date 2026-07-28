import type { ProjectComposition, SessionSegment } from "./composition-types";

export interface TimelineSessionSegment extends SessionSegment {
  timelineStartMs: number;
  timelineEndMs: number;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clone = (segments: readonly SessionSegment[]) => segments.map((segment) => ({ ...segment }));

/** Validates segments and derives the current compacted session timeline. */
export function sessionSegments(composition: ProjectComposition, sourceDurationMs: number): TimelineSessionSegment[] {
  const fallback = [{ id: "session:0", sourceStartMs: 0, sourceEndMs: Math.max(0, Math.round(sourceDurationMs)), active: true }];
  const input = composition.sessionSegments?.length ? composition.sessionSegments : fallback;
  let timelineMs = 0;
  return input
    .filter((segment) => typeof segment.id === "string" && finite(segment.sourceStartMs) && finite(segment.sourceEndMs) && segment.sourceStartMs >= 0 && segment.sourceEndMs > segment.sourceStartMs)
    .map((segment) => {
      const start = Math.round(segment.sourceStartMs);
      const end = Math.min(Math.round(sourceDurationMs), Math.round(segment.sourceEndMs));
      const duration = Math.max(0, end - start);
      const timelineStartMs = timelineMs;
      if (segment.active) timelineMs += duration;
      return { id: segment.id, sourceStartMs: start, sourceEndMs: end, active: Boolean(segment.active), timelineStartMs, timelineEndMs: timelineMs };
    })
    .filter((segment) => segment.sourceEndMs > segment.sourceStartMs);
}

export const sessionTimelineDuration = (composition: ProjectComposition, sourceDurationMs: number) =>
  sessionSegments(composition, sourceDurationMs).at(-1)?.timelineEndMs ?? 0;

export const sessionSegmentAtTimeline = (composition: ProjectComposition, timeMs: number, sourceDurationMs: number) =>
  sessionSegments(composition, sourceDurationMs).find((segment) => segment.active && timeMs >= segment.timelineStartMs && timeMs < segment.timelineEndMs) ?? null;

export const timelineToSourceMs = (composition: ProjectComposition, timeMs: number, sourceDurationMs: number) => {
  const segment = sessionSegmentAtTimeline(composition, timeMs, sourceDurationMs);
  if (!segment) return null;
  return segment.sourceStartMs + Math.max(0, Math.min(segment.sourceEndMs - segment.sourceStartMs, Math.round(timeMs) - segment.timelineStartMs));
};

export const sourceToTimelineMs = (composition: ProjectComposition, sourceMs: number, sourceDurationMs: number) => {
  const segment = sessionSegments(composition, sourceDurationMs).find((item) => item.active && sourceMs >= item.sourceStartMs && sourceMs < item.sourceEndMs);
  return segment ? segment.timelineStartMs + Math.round(sourceMs) - segment.sourceStartMs : null;
};

const withSegments = (composition: ProjectComposition, segments: SessionSegment[]): ProjectComposition => ({ ...composition, sessionSegments: clone(segments) });

export function splitSessionAtTimeline(composition: ProjectComposition, timeMs: number, sourceDurationMs: number): ProjectComposition {
  const segment = sessionSegmentAtTimeline(composition, timeMs, sourceDurationMs);
  const sourceMs = timelineToSourceMs(composition, timeMs, sourceDurationMs);
  if (!segment || sourceMs === null || sourceMs <= segment.sourceStartMs || sourceMs >= segment.sourceEndMs) return composition;
  const segments = sessionSegments(composition, sourceDurationMs).flatMap(({ timelineStartMs: _start, timelineEndMs: _end, ...item }) => item.id !== segment.id ? [item] : [
    { ...item, sourceEndMs: sourceMs },
    { ...item, id: `${item.id}:split:${sourceMs}`, sourceStartMs: sourceMs },
  ]);
  return withSegments(composition, segments);
}

export function trimSessionSegment(composition: ProjectComposition, id: string, edge: "start" | "end", timelineMs: number, sourceDurationMs: number): ProjectComposition {
  const segments = sessionSegments(composition, sourceDurationMs).map(({ timelineStartMs: _start, timelineEndMs: _end, ...segment }) => ({ ...segment }));
  const index = segments.findIndex((segment) => segment.id === id && segment.active);
  if (index < 0) return composition;
  const segment = sessionSegments(composition, sourceDurationMs)[index];
  const sourceMs = edge === "start"
    ? segment.sourceStartMs + Math.round(timelineMs) - segment.timelineStartMs
    : segment.sourceEndMs + Math.round(timelineMs) - segment.timelineEndMs;
  if (edge === "start") segments[index].sourceStartMs = Math.max(0, Math.min(segments[index].sourceEndMs - 1, sourceMs));
  else segments[index].sourceEndMs = Math.max(segments[index].sourceStartMs + 1, Math.min(Math.round(sourceDurationMs), sourceMs));
  return withSegments(composition, segments);
}

export function deleteSessionSegment(composition: ProjectComposition, id: string, sourceDurationMs: number): ProjectComposition {
  const segments = sessionSegments(composition, sourceDurationMs).map(({ timelineStartMs: _start, timelineEndMs: _end, ...segment }) => segment.id === id ? { ...segment, active: false } : segment);
  return withSegments(composition, segments);
}

export const baseVideoSegmentFromId = (id: string) => id.startsWith("base-video:") ? id.slice("base-video:".length) : null;
export const baseVideoSegmentAtTime = (composition: ProjectComposition, timeMs: number, durationMs: number) => sessionSegmentAtTimeline(composition, timeMs, durationMs);
export const deleteBaseVideoSegment = (composition: ProjectComposition, id: string, durationMs: number) => deleteSessionSegment(composition, id, durationMs);
