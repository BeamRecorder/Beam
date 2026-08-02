import { describe, expect, it } from "vitest";
import {
  calculateSnapThresholdMs,
  collectSnapTargets,
  snapSpan,
  snapValue,
} from "./timeline-snap";
import type { ClipComposition } from "../../composition/composition-types";
import type { ZoomElement } from "../../zoom/zoom-types";

const mockComposition = (
  overrides: Partial<ClipComposition> = {},
): ClipComposition => ({
  schemaVersion: 1,
  assets: [],
  clips: [
    {
      id: "clip-1",
      kind: "video",
      name: "Clip 1",
      timelineStartMs: 1_000,
      timelineDurationMs: 2_000, // ends at 3_000
      sourceInMs: 0,
      sourceDurationMs: 2_000,
      playbackRate: 1,
      enabled: true,
      order: 0,
      assetId: "asset-1",
      transform: { x: 0, y: 0, width: 1, height: 1 },
    },
    {
      id: "clip-2",
      kind: "audio",
      name: "Audio 1",
      role: "system",
      timelineStartMs: 5_000,
      timelineDurationMs: 3_000, // ends at 8_000
      sourceInMs: 0,
      sourceDurationMs: 3_000,
      playbackRate: 1,
      enabled: true,
      order: 1,
      assetId: "asset-2",
      volume: 1,
    },
  ],
  ...overrides,
});

const mockZooms: ZoomElement[] = [
  {
    id: "zoom-1",
    sessionId: "session-1",
    startMs: 3_500,
    endMs: 4_500,
    depth: 2,
    mode: "auto",
    focus: { cx: 0.5, cy: 0.5 },
  },
];

describe("timeline-snap", () => {
  describe("collectSnapTargets", () => {
    it("collects 0, duration, playhead, clip and zoom boundaries", () => {
      const composition = mockComposition();
      const targets = collectSnapTargets({
        composition,
        zoomElements: mockZooms,
        currentTime: 2.5, // 2500ms
        duration: 10,
      });

      expect(targets).toEqual([0, 1_000, 2_500, 3_000, 3_500, 4_500, 5_000, 8_000, 10_000]);
    });

    it("ignores specified clip and zoom IDs", () => {
      const composition = mockComposition();
      const targets = collectSnapTargets({
        composition,
        zoomElements: mockZooms,
        currentTime: 2.5,
        duration: 10,
        ignoreClipIds: ["clip-1"],
        ignoreZoomIds: ["zoom-1"],
      });

      expect(targets).toEqual([0, 2_500, 5_000, 8_000, 10_000]);
    });
  });

  describe("calculateSnapThresholdMs", () => {
    it("calculates threshold in ms based on ruler width and px threshold", () => {
      expect(calculateSnapThresholdMs(10_000, 1_000, 10)).toBe(100);
      expect(calculateSnapThresholdMs(10_000, 500, 10)).toBe(200);
    });

    it("uses default fallback when width or duration is invalid", () => {
      expect(calculateSnapThresholdMs(0, 1_000)).toBe(120);
      expect(calculateSnapThresholdMs(10_000, 0)).toBe(120);
    });
  });

  describe("snapValue", () => {
    it("snaps single value when within threshold", () => {
      const targets = [0, 1_000, 3_000, 5_000];
      const result = snapValue(1_050, targets, 100);
      expect(result).toEqual({ snappedValueMs: 1_000, targetMs: 1_000 });
    });

    it("returns null when no target is within threshold", () => {
      const targets = [0, 1_000, 3_000];
      const result = snapValue(1_500, targets, 100);
      expect(result).toBeNull();
    });
  });

  describe("snapSpan", () => {
    it("snaps start edge of span when start is close to a target", () => {
      const targets = [0, 1_000, 5_000];
      const result = snapSpan(980, 2_000, targets, 100);
      expect(result).toEqual({ snappedStartMs: 1_000, targetMs: 1_000 });
    });

    it("snaps end edge of span when end is close to a target", () => {
      const targets = [0, 1_000, 5_000];
      const result = snapSpan(2_920, 2_000, targets, 100);
      expect(result).toEqual({ snappedStartMs: 3_000, targetMs: 5_000 });
    });

    it("returns null when neither edge is close to targets", () => {
      const targets = [0, 1_000, 5_000];
      const result = snapSpan(2_200, 2_000, targets, 100);
      expect(result).toBeNull();
    });
  });
});
