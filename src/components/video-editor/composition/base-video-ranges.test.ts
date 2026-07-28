import { describe, expect, it } from "vitest";
import type { ProjectComposition } from "./composition-types";
import {
  deleteSessionSegment,
  sessionSegments,
  sessionTimelineDuration,
  sourceToTimelineMs,
  splitSessionAtTimeline,
  timelineToSourceMs,
  trimSessionSegment,
} from "./base-video-ranges";

const empty = (): ProjectComposition => ({ media: [], layers: [] });

describe("session segments", () => {
  it("starts as one active segment spanning the source", () => {
    expect(sessionSegments(empty(), 3_000)).toMatchObject([{ sourceStartMs: 0, sourceEndMs: 3_000, active: true, timelineStartMs: 0, timelineEndMs: 3_000 }]);
  });

  it("splits non-destructively at the mapped source frame", () => {
    const result = splitSessionAtTimeline(empty(), 1_000, 3_000);
    expect(result.sessionSegments).toMatchObject([{ sourceStartMs: 0, sourceEndMs: 1_000 }, { sourceStartMs: 1_000, sourceEndMs: 3_000 }]);
  });

  it("deletes a segment and ripples following active segments", () => {
    const cut = splitSessionAtTimeline(empty(), 1_000, 3_000);
    const result = deleteSessionSegment(cut, cut.sessionSegments![0].id, 3_000);
    expect(sessionTimelineDuration(result, 3_000)).toBe(2_000);
    expect(timelineToSourceMs(result, 0, 3_000)).toBe(1_000);
  });

  it("does not lose source frames after a delete", () => {
    const cut = splitSessionAtTimeline(empty(), 1_000, 3_000);
    const result = deleteSessionSegment(cut, cut.sessionSegments![0].id, 3_000);
    expect(result.sessionSegments![0]).toMatchObject({ sourceStartMs: 0, sourceEndMs: 1_000, active: false });
  });

  it("trims the start and can extend it back to source zero", () => {
    const cut = splitSessionAtTimeline(empty(), 1_000, 3_000);
    const id = cut.sessionSegments![1].id;
    const shortened = trimSessionSegment(cut, id, "start", 1_500, 3_000);
    const restored = trimSessionSegment(shortened, id, "start", 500, 3_000);
    expect(restored.sessionSegments![1].sourceStartMs).toBe(1_000);
  });

  it("trims the end and can extend it again", () => {
    const cut = splitSessionAtTimeline(empty(), 1_000, 3_000);
    const id = cut.sessionSegments![1].id;
    const shortened = trimSessionSegment(cut, id, "end", 2_000, 3_000);
    const restored = trimSessionSegment(shortened, id, "end", 3_000, 3_000);
    expect(restored.sessionSegments![1].sourceEndMs).toBe(3_000);
  });

  it("maps source to compacted timeline only when its segment is active", () => {
    const cut = splitSessionAtTimeline(empty(), 1_000, 3_000);
    const result = deleteSessionSegment(cut, cut.sessionSegments![0].id, 3_000);
    expect(sourceToTimelineMs(result, 500, 3_000)).toBeNull();
    expect(sourceToTimelineMs(result, 1_500, 3_000)).toBe(500);
  });
});
