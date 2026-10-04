import { describe, expect, it } from "vitest";
import {
  exportState,
  transitionState,
  clampTime,
  contentOpacity,
  createMotion,
  phaseTime,
  pointerAt,
  rippleFor,
  smooth,
  CLICKS,
} from "../src/motion";

describe("finite render clock", () => {
  it.each([NaN, Infinity, -Infinity])("rejects invalid clock %s", (value) =>
    expect(clampTime(value)).toBe(0),
  );
  it.each([
    [-1, 0],
    [0, 0],
    [500, 0.5],
    [8000, 8],
    [9000, 8],
  ])("clamps %s ms", (value, expected) =>
    expect(clampTime(value)).toBe(expected),
  );
  it.each([-2, 0, 0.5, 1, 2])("bounds smoothstep %s", (value) =>
    expect(smooth(value)).toBeGreaterThanOrEqual(0),
  );
  it("has a paused eight-second root", () => {
    const pose = { time: 0 },
      tl = createMotion(pose);
    expect(tl.paused()).toBe(true);
    expect(tl.duration()).toBe(8);
    tl.kill();
  });
  it("seeks forward and back without stale state", () => {
    const pose = { time: 0 },
      tl = createMotion(pose);
    tl.seek(5);
    expect(pose.time).toBe(5);
    tl.seek(1);
    expect(pose.time).toBe(1);
    tl.kill();
  });
  it("seeks both finite endpoints", () => {
    const pose = { time: 0 },
      tl = createMotion(pose);
    tl.seek(8);
    expect(pose.time).toBe(8);
    tl.seek(0);
    expect(pose.time).toBe(0);
    tl.kill();
  });
});
describe("seamless state reset", () => {
  it.each([0, 1, 7.2, 7.4])("keeps the authored clock before reset %s", (t) =>
    expect(phaseTime(t)).toBe(t),
  );
  it.each([7.6, 7.8, 8])(
    "resets the clock underneath the hidden editor %s",
    (t) => expect(phaseTime(t)).toBe(0),
  );
  it.each([0, 7.2, 8])("keeps full opacity at the opening and seam %s", (t) =>
    expect(contentOpacity(t)).toBe(1),
  );
  it.each([7.55, 7.6, 7.65])("hides the state replacement %s", (t) =>
    expect(contentOpacity(t)).toBe(0),
  );
  it("fades away and returns with bounded opacity", () => {
    expect(contentOpacity(7.35)).toBeLessThan(1);
    expect(contentOpacity(7.8)).toBeGreaterThan(0);
    for (let t = 0; t <= 8; t += 0.05)
      expect(contentOpacity(t)).toBeGreaterThanOrEqual(0);
  });
});
describe.each(["transitions", "export"] as const)(
  "%s cursor choreography",
  (mode) => {
    it("returns the same initial pose at the seam", () =>
      expect(pointerAt(mode, 8)).toEqual(pointerAt(mode, 0)));
    it("never places the cursor outside the editor", () => {
      for (let t = 0; t <= 8; t += 0.025) {
        const pose = pointerAt(mode, t);
        expect(pose.x).toBeGreaterThan(20);
        expect(pose.x).toBeLessThan(620);
        expect(pose.y).toBeGreaterThan(17);
        expect(pose.y).toBeLessThan(383);
      }
    });
    it("replays backward identically", () => {
      const first = pointerAt(mode, 2.23);
      pointerAt(mode, 7);
      expect(pointerAt(mode, 2.23)).toEqual(first);
    });
    it("uses a native click spring and ripple", () => {
      const click = CLICKS[mode][0]!;
      expect(pointerAt(mode, click.at + 0.08).scale).not.toBe(1);
      expect(
        rippleFor(click.at + 0.12, click)?.rings[0]?.opacity,
      ).toBeGreaterThan(0);
    });
    it("has no lingering ripple before or after a click", () => {
      const click = CLICKS[mode][0]!;
      expect(rippleFor(0, click)).toBeNull();
      expect(rippleFor(7, click)).toBeNull();
      expect(rippleFor(8, click)).toBeNull();
    });
  },
);

describe("transition preview sequence", () => {
  it.each([
    [0, "fade"],
    [0.75, "slide"],
    [2.8, "zoom"],
    [4, "blur"],
    [5.1, "fade"],
    [5.65, "zoom"],
  ] as const)("selects the native preset at %s", (time, kind) =>
    expect(transitionState(time).preset.kind).toBe(kind),
  );
  it("changes duration before applying it to the canvas", () => {
    expect(transitionState(1.69).duration).toBe(500);
    expect(transitionState(1.9).duration).toBeGreaterThan(500);
    expect(transitionState(2.15).duration).toBe(900);
    expect(transitionState(5).canvas).toBe(false);
    expect(transitionState(5.1).canvas).toBe(true);
    expect(transitionState(5.1).duration).toBe(900);
  });
  it("restarts the entry preview on each preset selection", () => {
    for (const time of [0.75, 2.8, 4, 5.1, 5.65])
      expect(transitionState(time).previewMs).toBe(0);
    expect(transitionState(0).previewMs).toBe(1000);
    expect(transitionState(4.4).previewMs).toBeCloseTo(400);
  });
  it("adds editable text after the canvas transition", () => {
    expect(transitionState(6.19).text).toBe(false);
    expect(transitionState(6.2).text).toBe(true);
    expect(transitionState(6.4).textProgress).toBeGreaterThan(0);
    expect(transitionState(6.7).textProgress).toBe(1);
  });
  it("bounds the playhead and resets all actions at the seam", () => {
    expect(transitionState(7.5).playheadMs).toBe(7500);
    expect(transitionState(8)).toEqual(transitionState(0));
  });
});
describe("local export sequence", () => {
  it("opens the export controls before changing format", () => {
    expect(exportState(0).open).toBe(false);
    expect(exportState(0.7).open).toBe(true);
    expect(exportState(1.45).format).toBe("webm");
    expect(exportState(2).format).toBe("mp4");
  });
  it("selects native maximum resolution, fps and quality in order", () => {
    expect(exportState(2).resolution).toBe("1080p");
    expect(exportState(2.7).resolution).toBe("max");
    expect(exportState(3).fps).toBe(30);
    expect(exportState(3.4).fps).toBe(60);
    expect(exportState(4).preset).toBe("medium");
    expect(exportState(4.1).preset).toBe("high");
  });
  it("shows progress before reporting the local file ready", () => {
    expect(exportState(4.79).running).toBe(false);
    expect(exportState(4.8).running).toBe(true);
    expect(exportState(5.5).progress).toBeGreaterThan(0);
    expect(exportState(5.5).progress).toBeLessThan(100);
    expect(exportState(6.34).saved).toBe(false);
    expect(exportState(6.35).running).toBe(false);
    expect(exportState(6.35).saved).toBe(true);
    expect(exportState(6.35).progress).toBe(100);
  });
  it("resets the saved file and selections at the loop seam", () =>
    expect(exportState(8)).toEqual(exportState(0)));
});
