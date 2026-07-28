import type { ProjectComposition, SessionSegment } from "./composition-types";

export interface TimelineSessionSegment extends SessionSegment {
  activeStartMs: number;
  activeEndMs: number;
  timelineStartMs: number;
  timelineEndMs: number;
  playbackRate: number;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const round = (value: number) => Math.round(value);

function fallback(sourceDurationMs: number): SessionSegment[] {
  return [{ id: "session:0", sourceStartMs: 0, sourceEndMs: Math.max(0, round(sourceDurationMs)), active: true }];
}

/**
 * The one session table used by playback, editing, export and all sidecars.
 * Source bounds never change after a split; trimming changes only active bounds.
 */
export function sessionSegments(composition: ProjectComposition, sourceDurationMs: number): TimelineSessionSegment[] {
  const sourceDuration = Math.max(0, round(sourceDurationMs));
  const input = composition.sessionSegments?.length ? composition.sessionSegments : fallback(sourceDuration);
  let timelineMs = 0;
  return input.flatMap((inputSegment) => {
    if (!isFiniteNumber(inputSegment.sourceStartMs) || !isFiniteNumber(inputSegment.sourceEndMs) || inputSegment.sourceStartMs < 0) return [];
    const sourceStartMs = Math.min(sourceDuration, Math.max(0, round(inputSegment.sourceStartMs)));
    const sourceEndMs = Math.min(sourceDuration, Math.max(sourceStartMs, round(inputSegment.sourceEndMs)));
    if (!inputSegment.id || sourceEndMs <= sourceStartMs) return [];
    const requestedActiveStart = isFiniteNumber(inputSegment.activeStartMs) ? round(inputSegment.activeStartMs) : sourceStartMs;
    const requestedActiveEnd = isFiniteNumber(inputSegment.activeEndMs) ? round(inputSegment.activeEndMs) : sourceEndMs;
    const activeStartMs = Math.max(sourceStartMs, Math.min(sourceEndMs - 1, requestedActiveStart));
    const activeEndMs = Math.max(activeStartMs + 1, Math.min(sourceEndMs, requestedActiveEnd));
    const playbackRate = Math.max(.25, Math.min(4, inputSegment.playbackRate ?? composition.baseVideoPlaybackRate ?? 1));
    const timelineStartMs = timelineMs;
    if (inputSegment.active) timelineMs += (activeEndMs - activeStartMs) / playbackRate;
    return [{
      id: inputSegment.id,
      sourceStartMs,
      sourceEndMs,
      activeStartMs,
      activeEndMs,
      active: Boolean(inputSegment.active),
      playbackRate,
      timelineStartMs,
      timelineEndMs: timelineMs,
    }];
  });
}

export const sessionTimelineDuration = (composition: ProjectComposition, sourceDurationMs: number) =>
  sessionSegments(composition, sourceDurationMs).at(-1)?.timelineEndMs ?? 0;

export const sessionSegmentAtTimeline = (composition: ProjectComposition, timeMs: number, sourceDurationMs: number) => {
  const segments = sessionSegments(composition, sourceDurationMs).filter((segment) => segment.active);
  const timelineDuration = segments.at(-1)?.timelineEndMs ?? 0;
  if (!isFiniteNumber(timeMs) || timeMs < 0 || timeMs > timelineDuration) return null;
  if (timeMs === timelineDuration) return segments.at(-1) ?? null;
  return segments.find((segment) => timeMs >= segment.timelineStartMs && timeMs < segment.timelineEndMs) ?? null;
};

/** Converts an inclusive timeline boundary to its source boundary. */
export const timelineToSourceMs = (composition: ProjectComposition, timeMs: number, sourceDurationMs: number) => {
  const segment = sessionSegmentAtTimeline(composition, round(timeMs), sourceDurationMs);
  if (!segment) return null;
  if (round(timeMs) === segment.timelineEndMs) return segment.activeEndMs;
  return Math.round(segment.activeStartMs + Math.max(0, timeMs - segment.timelineStartMs) * segment.playbackRate);
};

/** Converts an inclusive source boundary when it belongs to an active portion. */
export const sourceToTimelineMs = (composition: ProjectComposition, sourceMs: number, sourceDurationMs: number) => {
  if (!isFiniteNumber(sourceMs)) return null;
  const source = round(sourceMs);
  const active = sessionSegments(composition, sourceDurationMs).filter((segment) => segment.active);
  const segment = active.find((item) => source >= item.activeStartMs && source < item.activeEndMs)
    ?? active.find((item) => source === item.activeEndMs);
  if (!segment) return null;
  return source === segment.activeEndMs
    ? segment.timelineEndMs
    : Math.round(segment.timelineStartMs + (source - segment.activeStartMs) / segment.playbackRate);
};

const persistedSegments = (composition: ProjectComposition, sourceDurationMs: number): SessionSegment[] =>
  sessionSegments(composition, sourceDurationMs).map(({ timelineStartMs: _timelineStart, timelineEndMs: _timelineEnd, ...segment }) => segment);
const withSegments = (composition: ProjectComposition, segments: SessionSegment[]): ProjectComposition =>
  ({ ...composition, sessionSegments: segments.map((segment) => ({ ...segment })) });

export function splitSessionAtTimeline(composition: ProjectComposition, timeMs: number, sourceDurationMs: number): ProjectComposition {
  const segment = sessionSegmentAtTimeline(composition, timeMs, sourceDurationMs);
  const sourceMs = timelineToSourceMs(composition, timeMs, sourceDurationMs);
  if (!segment || sourceMs === null || sourceMs <= segment.activeStartMs || sourceMs >= segment.activeEndMs) return composition;
  return withSegments(composition, persistedSegments(composition, sourceDurationMs).flatMap((item) => item.id !== segment.id ? [item] : [
    { ...item, sourceEndMs: sourceMs, activeEndMs: sourceMs },
    { ...item, id: `${item.id}:split:${sourceMs}`, sourceStartMs: sourceMs, activeStartMs: sourceMs },
  ]));
}

export function trimSessionSegment(composition: ProjectComposition, id: string, edge: "start" | "end", timelineMs: number, sourceDurationMs: number): ProjectComposition {
  const segments = persistedSegments(composition, sourceDurationMs);
  const segment = sessionSegments(composition, sourceDurationMs).find((item) => item.id === id && item.active);
  const index = segments.findIndex((item) => item.id === id);
  if (!segment || index < 0 || !isFiniteNumber(timelineMs)) return composition;
  const sourceMs = edge === "start"
    ? segment.activeStartMs + (timelineMs - segment.timelineStartMs) * segment.playbackRate
    : segment.activeEndMs + (timelineMs - segment.timelineEndMs) * segment.playbackRate;
  if (edge === "start") segments[index].activeStartMs = Math.max(segment.sourceStartMs, Math.min(segment.activeEndMs - 1, sourceMs));
  else segments[index].activeEndMs = Math.max(segment.activeStartMs + 1, Math.min(segment.sourceEndMs, sourceMs));
  return withSegments(composition, segments);
}

export function deleteSessionSegment(composition: ProjectComposition, id: string, sourceDurationMs: number): ProjectComposition {
  return withSegments(composition, persistedSegments(composition, sourceDurationMs).map((segment) =>
    segment.id === id ? { ...segment, active: false } : segment));
}

export const baseVideoSegmentFromId = (id: string) => id.startsWith("base-video:") ? id.slice("base-video:".length) : null;
export const baseVideoSegmentAtTime = (composition: ProjectComposition, timeMs: number, durationMs: number) => sessionSegmentAtTimeline(composition, timeMs, durationMs);
export const deleteBaseVideoSegment = (composition: ProjectComposition, id: string, durationMs: number) => deleteSessionSegment(composition, id, durationMs);
