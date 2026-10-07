import { describe, expect, it } from "vitest";
import {
  cameraAt,
  CLICKS,
  clampTime,
  createMotion,
  modeAt,
  opacityAt,
  phaseTime,
  pointerAt,
  previewTimeAt,
  progress,
  smooth,
  stageAt,
} from "../src/motion";
describe("Studio demonstration clock", () => {
  it.each([
    [NaN, 0],
    [Infinity, 0],
    [-Infinity, 0],
    [-1, 0],
    [4600, 4.6],
    [20000, 15],
  ])("bounds %s", (ms, expected) => expect(clampTime(ms)).toBe(expected));
  it.each([
    [-2, 0],
    [0, 0],
    [0.5, 0.5],
    [1, 1],
    [3, 1],
  ])("eases %s", (x, expected) => expect(smooth(x)).toBe(expected));
  it("orders native edit states at their clicks", () => {
    expect(
      [0, 2.199, 2.2, 3.05, 3.8, 4.45, 5.15, 14.64, 14.65, 15].map(stageAt),
    ).toEqual([
      "initial",
      "initial",
      "trimmed",
      "split",
      "split-again",
      "deleted",
      "cut",
      "cut",
      "initial",
      "initial",
    ]);
  });
  it("discloses the inspector for each actual gesture", () => {
    expect([0, 5.95, 7.95, 9.45, 10.95, 12.5, 15].map(modeAt)).toEqual([
      "clip",
      "caption",
      "shadow",
      "size",
      "canvas",
      "clip",
      "clip",
    ]);
  });
  it("keeps scrubbing distinct from playback", () => {
    expect(
      [0, 2.2, 3.05, 3.8, 5.15, 12.5, 13.5, 15].map(previewTimeAt),
    ).toEqual([0.65, 3.6, 4.4, 4, 4.4, 4.4, 5.4, 0.65]);
  });
  it("resets all geometry under the fade and ends on the opening frame", () => {
    expect(phaseTime(14.64)).toBe(14.64);
    expect(phaseTime(14.65)).toBe(0);
    expect(opacityAt(14.25)).toBe(1);
    expect(opacityAt(14.65)).toBe(0);
    expect(opacityAt(14.4)).toBeGreaterThan(0);
    expect(opacityAt(14.8)).toBeLessThan(1);
    expect(opacityAt(0)).toBe(1);
    expect(opacityAt(15)).toBe(1);
    expect(pointerAt(15)).toEqual(pointerAt(0));
    expect(cameraAt(15)).toEqual(cameraAt(0));
  });
  it.each([0, 5, 15])("clamps gesture progress at %s", (t) =>
    expect(progress(t, 4, 6)).toBe(t === 5 ? 0.5 : 0),
  );
  it("traverses the entire cursor/camera route with finite geometry and bounded native press response", () => {
    for (let t = -0.1; t <= 15.1; t += 0.025) {
      const cursor = pointerAt(t),
        camera = cameraAt(t);
      expect(cursor.x).toBeGreaterThan(0);
      expect(cursor.x).toBeLessThan(1280);
      expect(cursor.y).toBeGreaterThan(0);
      expect(cursor.y).toBeLessThan(800);
      expect(Number.isFinite(cursor.scale)).toBe(true);
      expect(camera.scale).toBeGreaterThanOrEqual(1);
      expect(camera.scale).toBeLessThanOrEqual(1.22);
      expect(Number.isFinite(camera.x + camera.y)).toBe(true);
      const origin =
        cursor.role === "resizewesteast"
          ? { x: 27, y: 27 }
          : { x: 16.875, y: 11.8125 };
      const left =
        camera.x + (cursor.x - origin.x * cursor.scale) * camera.scale;
      const top =
        camera.y + (cursor.y - origin.y * cursor.scale) * camera.scale;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left + 54 * cursor.scale * camera.scale).toBeLessThanOrEqual(1280);
      expect(top + 54 * cursor.scale * camera.scale).toBeLessThanOrEqual(800);
    }
    expect(pointerAt(1.2).role).toBe("resizewesteast");
    expect(pointerAt(2.4).role).toBe("default");
    for (const click of CLICKS) {
      expect(pointerAt(click + 0.05).scale).toBeGreaterThan(0.4);
      expect(pointerAt(click + 0.05).scale).toBeLessThan(1.6);
    }
  });
  it("holds each focus view and limits camera travel so the controls remain readable", () => {
    expect(cameraAt(2.2)).toEqual(cameraAt(0));
    expect(cameraAt(3.1)).toEqual(cameraAt(5.25));
    expect(cameraAt(6.2)).toEqual(cameraAt(11.95));
    expect(cameraAt(12.85)).toEqual(cameraAt(14.2));
    for (let t = 0; t < 14.2; t += 1 / 60) {
      const before = cameraAt(t),
        after = cameraAt(t + 1 / 60);
      expect(Math.abs(after.scale - before.scale) * 60).toBeLessThan(0.4);
      expect(
        Math.hypot(after.x - before.x, after.y - before.y) * 60,
      ).toBeLessThan(250);
    }
  });
  it("is one paused, exactly fifteen-second reversible timeline", () => {
    const pose = { time: 0 },
      timeline = createMotion(pose);
    expect(timeline.paused()).toBe(true);
    expect(timeline.duration()).toBe(15);
    timeline.seek(8, false);
    expect(pose.time).toBe(8);
    timeline.seek(2, false);
    expect(pose.time).toBe(2);
    timeline.seek(0, false);
    expect(pose.time).toBe(0);
    timeline.kill();
  });
});
