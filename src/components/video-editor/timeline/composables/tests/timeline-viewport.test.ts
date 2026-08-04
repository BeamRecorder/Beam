import { describe, expect, it } from "vitest";
import {
  timelinePercentStyle,
  timelineRulerSecondsInView,
  timelineSecondsInView,
} from "../timeline-viewport";

describe("timeline viewport", () => {
  it("limits thumbnails to the visible interval plus a small buffer", () => {
    expect(timelineSecondsInView(120, 40, 43)).toEqual([
      37, 38, 39, 40, 41, 42, 43, 44, 45, 46,
    ]);
  });

  it("clamps thumbnail intervals at both ends of the recording", () => {
    expect(timelineSecondsInView(5, -4, 2)).toEqual([0, 1, 2, 3, 4]);
  });

  it("does not render virtual items for an empty or invalid timeline", () => {
    expect(timelineSecondsInView(0, 0, 1)).toEqual([]);
    expect(timelineRulerSecondsInView(Number.NaN, [0, 1])).toEqual([]);
  });

  it("keeps the first and final ruler labels available", () => {
    expect(timelineRulerSecondsInView(65, [10, 11, 12])).toEqual([
      0, 10, 11, 12, 65,
    ]);
  });

  it("positions a frame against the full timeline, not the viewport", () => {
    expect(timelinePercentStyle(100, 25)).toEqual({ left: "25%", width: "1%" });
  });
});
