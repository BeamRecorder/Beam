import { describe, expect, it } from "vitest";
import { cursorRoleForPose } from "../src/cursor-role";
import {
  createMotion,
  initialPose,
  FIRST_START,
  SCREEN_Y,
  TRACK_LEFT,
  px,
} from "../src/motion";
import { clipDuration } from "../src/timeline-model";

describe("native macOS timeline cursor roles", () => {
  it.each([
    [0, "default"],
    [0.35, "default"],
    [0.7, "resizewesteast"],
    [1.3, "resizewesteast"],
    [1.9, "resizewesteast"],
    [2.02, "resizewesteast"],
    [2.4, "default"],
    [3, "default"],
    [4.6, "default"],
    [5, "default"],
  ])(
    "uses %s seconds to select %s from the actual gesture",
    (time, expected) => {
      const pose = initialPose(),
        timeline = createMotion(pose);
      timeline.seek(time);
      expect(cursorRoleForPose(pose)).toBe(expected);
      timeline.seek(4.9);
      timeline.seek(0);
      timeline.seek(time);
      expect(cursorRoleForPose(pose)).toBe(expected);
      timeline.kill();
    },
  );
  it.each([0, 0.5, 1])(
    "finds the hovered edge after trim=%s without requiring a press",
    (trim) => {
      const pose = { ...initialPose(), trim, cursorY: SCREEN_Y };
      pose.cursorX = TRACK_LEFT + px(FIRST_START + clipDuration(pose)) - 5;
      expect(cursorRoleForPose(pose)).toBe("resizewesteast");
      pose.cursorX += 9;
      expect(cursorRoleForPose(pose)).toBe("default");
    },
  );
  it.each([-16, 16])(
    "returns to the pointer %s px above/below the handle",
    (offset) => {
      const pose = { ...initialPose(), cursorY: SCREEN_Y + offset };
      pose.cursorX = TRACK_LEFT + px(FIRST_START + clipDuration(pose)) - 5;
      expect(cursorRoleForPose(pose)).toBe("default");
    },
  );
  it("holds resize during the captured trim even outside the hovered edge", () => {
    expect(cursorRoleForPose({ ...initialPose(), trimActive: 1 })).toBe(
      "resizewesteast",
    );
  });
  it("keeps the pointer during a captured move across the edge", () => {
    const pose = { ...initialPose(), cursorY: SCREEN_Y, moveActive: 1 };
    pose.cursorX = TRACK_LEFT + px(FIRST_START + clipDuration(pose)) - 5;
    expect(cursorRoleForPose(pose)).toBe("default");
  });
});
