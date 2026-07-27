import { describe, expect, it } from "vitest";
import type { ProjectComposition } from "./composition-types";
import {
  activeVisualTracksAt,
  normalizedVisualTrackOrder,
  visualTracks,
} from "./visual-stack";

const composition = (visualTrackOrder?: string[]): ProjectComposition => ({
  media: [
    { id: "image", kind: "image", name: "Image", fileName: "image.png", durationMs: 1000, width: 100, height: 100, src: "" },
    { id: "video", kind: "video", name: "Video", fileName: "video.mp4", durationMs: 1000, width: 100, height: 100, src: "" },
    { id: "camera", kind: "video", name: "Webcam", fileName: null, durationMs: 1000, width: 100, height: 100, src: "", origin: "session", sessionId: "session", sessionPath: "camera.mp4" },
  ],
  layers: [
    { id: "image-layer", kind: "image", name: "Image", assetId: "image", startMs: 0, endMs: 1000, enabled: true, order: 0 },
    { id: "video-layer", kind: "video", name: "Video", assetId: "video", startMs: 0, endMs: 1000, enabled: true, order: 1 },
    { id: "camera-a", kind: "video", name: "Webcam", assetId: "camera", startMs: 0, endMs: 400, enabled: true, order: 2, reactToZoom: true },
    { id: "camera-b", kind: "video", name: "Webcam", assetId: "camera", startMs: 400, endMs: 1000, enabled: true, order: 3, reactToZoom: true },
  ],
  ...(visualTrackOrder ? { visualTrackOrder } : {}),
});

describe("visual stack", () => {
  it("uses a single webcam track and appends missing historical tracks", () => {
    expect(normalizedVisualTrackOrder(composition(["video-layer"]))).toEqual([
      "video-layer", "image-layer", "webcam", "base-video",
    ]);
  });

  it("keeps timeline order front-to-back and renders it back-to-front", () => {
    const project = composition(["base-video", "webcam", "image-layer", "video-layer"]);
    expect(visualTracks(project).map((track) => track.id)).toEqual([
      "base-video", "webcam", "image-layer", "video-layer",
    ]);
    expect(activeVisualTracksAt(project, 500).map((track) => track.id)).toEqual([
      "video-layer", "image-layer", "webcam", "base-video",
    ]);
  });
});
