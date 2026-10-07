import { regionStrength } from "../../../packages/engine/src/zoom/zoom-playback";
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
      0, 1.3, 1.8, 2.2, 3.05, 3.8, 4.45, 5.15, 5.95, 6.9, 8.9, 9.95, 10.2,
      11.75, 12.5, 14.5, 15,
    ]) {
      const document = compositionAt(t);
      expect(() => validateComposition(document)).not.toThrow();
      document.clips[0]!.name = "Changed";
      expect(compositionAt(t).clips[0]!.name).not.toBe("Changed");
    }
  });
  it("trims both screen and linked webcam, then splits and cuts an actual 800ms source interval", () => {
    expect(compositionDurationMs(compositionAt(0))).toBe(12000);
    expect(compositionDurationMs(compositionAt(2.2))).toBe(11200);
    expect(
      compositionAt(3.8).clips.filter((c) => c.kind === "screen"),
    ).toHaveLength(3);
    const document = compositionAt(5.4),
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
    expect(captionAt(6.0).caption.type).toBe("text");
    const draft = captionAt(6.9),
      finished = captionAt(7.5);
    expect(draft.caption.style.customText!.length).toBeGreaterThan(0);
    expect(draft.caption.style.customText!.length).toBeLessThan(TEXT.length);
    expect(finished.caption.style.customText).toBe(TEXT);
    expect(finished.isAiGenerated).toBeUndefined();
    expect(
      finished.caption.type === "text" && finished.caption.sentences[0]!.words,
    ).toEqual([]);
    expect(compositionAt(5.8).clips.some((c) => c.kind === "caption")).toBe(
      false,
    );
  });
  it("keeps camera ownership correct so the native Remove gap action is enabled", () => {
    const deleted = compositionAt(4.9),
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
    expect(selectedScreen(4.1).timelineStartMs).toBe(3600);
    expect(selectedScreen(4.1).timelineDurationMs).toBe(800);
    expect(selectedScreen(9.1).timelineStartMs).toBe(3600);
    expect(selectedScreen(8.8).shadowColor).toBe("#17171d");
    expect(selectedScreen(9.1).shadowColor).toBe("#6a46e6");
    expect(selectedScreen(9.8).clipTransform!.width).toBe(1);
    const placement = selectedScreen(10.7).clipTransform!;
    expect(placement.width).toBeCloseTo(0.86);
    expect(placement.x).toBeCloseTo(0.07);
    expect(placement.y).toBeCloseTo(0.07);
    expect(selectedScreen(10.7).shadowSize).toBe("lg");
  });
  it("uses the actual catalog gradient and actual native zoom timing only in final playback", () => {
    expect(snapshotAt(11.5).background!.kind).toBe("image");
    expect(snapshotAt(11.75).background).toEqual({
      kind: "gradient",
      gradient: OCEAN.gradient,
    });
    expect(zoomsAt(12.4)).toEqual([]);
    expect(zoomsAt(12.6)[0]).toMatchObject({
      mode: "manual",
      projection: "2d",
      startMs: 4800,
      endMs: 7200,
      depth: 2,
    });
    expect(snapshotAt(10).composition).toEqual(stateAt(10).composition);
    expect(stateAt(12.4).playing).toBe(false);
    expect(stateAt(12.6).playing).toBe(true);
  });
  it("starts final playback at native zoom strength zero and eases into a modest zoom", () => {
    const zoom = zoomsAt(12.5)[0]!;
    expect(regionStrength(zoom, stateAt(12.5).previewTime * 1000)).toBe(0);
    expect(
      regionStrength(zoom, stateAt(13).previewTime * 1000),
    ).toBeGreaterThan(0);
    expect(regionStrength(zoom, stateAt(13).previewTime * 1000)).toBeLessThan(
      1,
    );
    expect(regionStrength(zoom, stateAt(14.1).previewTime * 1000)).toBe(1);
  });
  it("returns an identical end/opening state without modifying any original source fixture", () => {
    expect(stateAt(15)).toEqual(stateAt(0));
    expect(snapshotAt(15)).toEqual(snapshotAt(0));
    const snapshot = snapshotAt(10);
    snapshot.composition.clips.length = 0;
    expect(snapshotAt(10).composition.clips.length).toBeGreaterThan(0);
    expect(snapshotAt(10).cursor.events.length).toBeGreaterThan(0);
  });
});
