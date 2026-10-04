import { describe, expect, it } from "vitest";
import {
  clampTime,
  clickAt,
  createMotion,
  DURATION_MS,
  initialPose,
  INITIAL_ID,
  rippleAt,
  stateAt,
  STEPS,
} from "../src/motion";

describe("canvas library choreography", () => {
  it("has one paused seven-second clock and restores the cursor/camera at the seam", () => {
    const pose = initialPose(),
      first = { ...pose },
      timeline = createMotion(pose);
    expect(timeline.paused()).toBe(true);
    expect(timeline.duration()).toBe(7);
    timeline.seek(7);
    expect({ time: 0, x: pose.x, y: pose.y, camera: pose.camera }).toEqual(
      first,
    );
    expect(stateAt(7).tab).toBe("image");
    expect(stateAt(7).restore).toBe(1);
    timeline.kill();
  });
  it.each(STEPS)("lands the pointer on $id before the click", (step) => {
    const pose = initialPose(),
      timeline = createMotion(pose);
    timeline.seek(step.at);
    expect(pose.x).toBeCloseTo(step.x, 3);
    expect(pose.y).toBeCloseTo(step.y, 3);
    expect(clickAt(pose.time).click?.id).toBe(step.id);
    timeline.kill();
  });
  it.each([0, 620, 1580, 2750, 3990, 4430, 5500, 6660])(
    "reproduces %s ms after reversing seeks",
    (time) => {
      const pose = initialPose(),
        timeline = createMotion(pose);
      timeline.seek(time / 1000);
      const first = { ...pose };
      timeline.seek(6.7);
      timeline.seek(0);
      timeline.seek(time / 1000);
      expect(pose).toEqual(first);
      timeline.kill();
    },
  );
  it.each([
    [-200, 0],
    [0, 0],
    [7000, 7],
    [9000, 7],
    [NaN, 0],
    [Infinity, 0],
  ])("clamps %s safely", (value, expected) => {
    expect(clampTime(value)).toBe(expected);
    expect(DURATION_MS).toBe(7000);
  });
  it("keeps the image until the video tile is selected, and the video until the color is selected", () => {
    expect(stateAt(0).current.id).toBe(INITIAL_ID);
    expect(stateAt(2.5)).toMatchObject({
      tab: "video",
      current: { id: "mountaintrees" },
    });
    expect(stateAt(4.1)).toMatchObject({
      tab: "color",
      current: { id: "wispysky" },
    });
    expect(stateAt(5.2)).toMatchObject({
      tab: "gradient",
      current: { id: "color:#1d4ed8" },
    });
  });
  it("crossfades only after a selection and restores the first image at the end", () => {
    expect(stateAt(1.52).transition).toBe(0);
    expect(stateAt(1.66).transition).toBeCloseTo(0.5);
    expect(stateAt(1.81).transition).toBe(1);
    expect(stateAt(6.5).restore).toBeGreaterThan(0);
    expect(stateAt(6.81).restore).toBe(1);
  });
  it("uses Beam's spring for compression, rebound and settlement", () => {
    expect(clickAt(0).scale).toBe(1);
    expect(clickAt(STEPS[0]!.at + 0.065).scale).toBeLessThan(0.9);
    expect(clickAt(STEPS[0]!.at + 0.19).scale).toBeGreaterThan(1);
    expect(clickAt(STEPS[0]!.at + 0.45).scale).toBe(1);
  });
  it("keeps click rings tied to the recorded target and releases them within half a second", () => {
    const click = STEPS[0]!;
    expect(rippleAt(click.at - 0.01, click)).toBeNull();
    expect(rippleAt(click.at + 0.14, click)?.rings).toHaveLength(2);
    expect(rippleAt(click.at + 0.51, click)).toBeNull();
    expect([click.x, click.y]).toEqual([408.6, 152.8]);
  });
});
