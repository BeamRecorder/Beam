import { describe, expect, it } from "vitest";
import { validateComposition } from "../../../packages/engine/src/commands/clip-composition-validation";
import {
  sourceTimeAt,
  compositionDurationMs,
} from "../../../packages/engine/src/shared/timeline-mapping";
import {
  removeTimelineGap,
  timelineGaps,
} from "../../../packages/engine/src/composition/timeline-gaps";
import {
  captionAt,
  compositionAt,
  OCEAN,
  selectedScreen,
  snapshotAt,
  stateAt,
  TEXT,
  zoomsAt,
} from "../src/scene-model";
describe("Actual Quiet Aurora 4 edit document", () => {
  it("keeps every authored stage schema-valid and isolated from its frozen fixture", () => {
    for (const t of [
      0, 1.05, 1.4, 1.7, 2.05, 2.45, 2.85, 3.25, 4.05, 4.7, 5.9, 6.8, 7.1, 8.35,
      9.15, 11.5, 12,
    ]) {
      const document = compositionAt(t);
      expect(() => validateComposition(document)).not.toThrow();
      document.clips[0]!.name = "Changed";
      expect(compositionAt(t).clips[0]!.name).not.toBe("Changed");
    }
  });
  it("trims both screen and linked webcam, then splits and cuts an actual 800ms source interval", () => {
    expect(compositionDurationMs(compositionAt(0))).toBe(12000);
    expect(compositionDurationMs(compositionAt(1.7))).toBe(11200);
    expect(
      compositionAt(2.45).clips.filter((c) => c.kind === "screen"),
    ).toHaveLength(3);
    const document = compositionAt(3.4),
      screens = document.clips.filter((c) => c.kind === "screen");
    expect(screens).toHaveLength(2);
    expect(compositionDurationMs(document)).toBe(10400);
    expect(screens[0]!.timelineDurationMs).toBe(3600);
    expect(screens[1]!.timelineStartMs).toBe(3600);
    expect(sourceTimeAt(screens[1]!, 3600)).toBe(4400);
    expect(
      document.clips
        .filter((c) => c.kind === "webcam")
        .some((c) => sourceTimeAt(c, 4000) !== null),
    ).toBe(true);
  });
  it("types a manual caption without inventing transcript or word timings", () => {
    expect(captionAt(4.1).caption.type).toBe("text");
    const draft = captionAt(4.7),
      finished = captionAt(5.1);
    expect(draft.caption.style.customText!.length).toBeGreaterThan(0);
    expect(draft.caption.style.customText!.length).toBeLessThan(TEXT.length);
    expect(finished.caption.style.customText).toBe(TEXT);
    expect(finished.isAiGenerated).toBeUndefined();
    expect(
      finished.caption.type === "text" && finished.caption.sentences[0]!.words,
    ).toEqual([]);
    expect(compositionAt(4).clips.some((c) => c.kind === "caption")).toBe(
      false,
    );
  });
  it("keeps camera ownership correct so the native Remove gap action is enabled", () => {
    const deleted = compositionAt(3.1),
      screens = deleted.clips.filter((c) => c.kind === "screen");
    const gap = timelineGaps(screens).find((gap) => gap.startMs === 3600)!;
    const closed = removeTimelineGap(deleted, gap).composition;
    expect(closed).not.toBe(deleted);
    expect(compositionDurationMs(closed)).toBe(10400);
    for (const clip of closed.clips)
      if (clip.kind === "webcam") {
        const owner = closed.clips.find((c) => c.id === clip.recordingClipId)!;
        expect(owner.timelineStartMs).toBeLessThanOrEqual(clip.timelineStartMs);
        expect(
          owner.timelineStartMs + owner.timelineDurationMs,
        ).toBeGreaterThan(clip.timelineStartMs);
      }
  });
  it("uses the same screen placement and appearance for inspector and compositor", () => {
    expect(selectedScreen(2.6).timelineStartMs).toBe(3600);
    expect(selectedScreen(2.6).timelineDurationMs).toBe(800);
    expect(selectedScreen(6).timelineStartMs).toBe(3600);
    expect(selectedScreen(5).shadowColor).toBe("#17171d");
    expect(selectedScreen(6).shadowColor).toBe("#6a46e6");
    expect(selectedScreen(6.7).clipTransform!.width).toBe(1);
    const placement = selectedScreen(7.4).clipTransform!;
    expect(placement.width).toBeCloseTo(0.86);
    expect(placement.x).toBeCloseTo(0.07);
    expect(placement.y).toBeCloseTo(0.07);
    expect(selectedScreen(7.4).shadowSize).toBe("lg");
  });
  it("uses the actual catalog gradient and actual native zoom timing only in final playback", () => {
    expect(snapshotAt(8).background!.kind).toBe("image");
    expect(snapshotAt(8.35).background).toEqual({
      kind: "gradient",
      gradient: OCEAN.gradient,
    });
    expect(zoomsAt(9)).toEqual([]);
    expect(zoomsAt(9.2)[0]).toMatchObject({
      mode: "manual",
      projection: "2d",
      startMs: 3500,
      endMs: 6600,
      depth: 2,
    });
    expect(snapshotAt(10).composition).toEqual(stateAt(10).composition);
    expect(stateAt(9).playing).toBe(false);
    expect(stateAt(9.2).playing).toBe(true);
  });
  it("returns an identical end/opening state without modifying any original source fixture", () => {
    expect(stateAt(12)).toEqual(stateAt(0));
    expect(snapshotAt(12)).toEqual(snapshotAt(0));
    const snapshot = snapshotAt(10);
    snapshot.composition.clips.length = 0;
    expect(snapshotAt(10).composition.clips.length).toBeGreaterThan(0);
    expect(snapshotAt(10).cursor.events.length).toBeGreaterThan(0);
  });
});
