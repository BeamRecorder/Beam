import { describe, expect, it } from "vitest";
import {
  isThumbnailWorkerRequest,
  uniqueSortedTimes,
} from "../thumbnail-protocol";

describe("thumbnail worker protocol", () => {
  it("sorts, deduplicates, and rejects invalid timestamps", () => {
    expect(uniqueSortedTimes([3, -1, 1, 3, Number.NaN, 2])).toEqual([1, 2, 3]);
  });

  it("accepts a complete frame request", () => {
    expect(
      isThumbnailWorkerRequest({
        type: "request-frames",
        generation: 3,
        source: "file:///recording.mp4",
        visibleTimes: [0, 1],
      }),
    ).toBe(true);
  });

  it("rejects incomplete and malformed worker messages", () => {
    expect(
      isThumbnailWorkerRequest({
        type: "request-frames",
        generation: 0,
        source: "x",
        visibleTimes: ["1"],
      }),
    ).toBe(false);
    expect(isThumbnailWorkerRequest({ type: "clear", generation: -1 })).toBe(
      false,
    );
    expect(isThumbnailWorkerRequest(null)).toBe(false);
  });
});
