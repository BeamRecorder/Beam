import { describe, expect, it } from "vitest";
import {
  detachSidecarLink,
  resolveSidecarLinks,
} from "./sidecar-links";
import type { ProjectComposition } from "./composition-types";

const composition = (): ProjectComposition => ({
  media: [
    { id: "asset-video", kind: "video", name: "Demo", fileName: "demo.webm", durationMs: 10_000, width: 1280, height: 720, src: "" },
    { id: "asset-camera", kind: "video", name: "Webcam", fileName: null, durationMs: 10_000, width: 640, height: 480, src: "", origin: "session", sessionId: "session", sessionPath: "camera.webm" },
  ],
  layers: [
    { id: "video", kind: "video", name: "Demo", assetId: "asset-video", startMs: 0, endMs: 10_000, enabled: true, order: 0, groupId: "pair" },
    { id: "audio", kind: "audio", name: "Demo audio", assetId: "asset-video", startMs: 0, endMs: 10_000, enabled: true, order: 1, groupId: "pair" },
    { id: "camera", kind: "video", name: "Webcam", assetId: "asset-camera", startMs: 0, endMs: 10_000, enabled: true, order: 2, reactToZoom: true },
  ],
});

const editorData = {
  tracks: [
    { kind: "system-audio", status: "completed", assets: [{ exists: true }] },
    { kind: "microphone", status: "completed", assets: [{ exists: true }] },
  ],
} as never;

describe("sidecar links", () => {
  it("resolves the audio paired with imported video", () => {
    expect(resolveSidecarLinks(composition(), null, "video")).toMatchObject([
      { id: "audio", kind: "clip", name: "Demo audio" },
    ]);
  });

  it("resolves webcam and available audio sidecars for the primary video", () => {
    expect(resolveSidecarLinks(composition(), editorData, "base-video")).toMatchObject([
      { id: "camera", key: "camera" },
      { id: "system-audio", key: "system-audio" },
      { id: "microphone", key: "microphone" },
    ]);
  });

  it("detaches only the chosen session sidecar", () => {
    const next = detachSidecarLink(composition(), "base-video", {
      id: "microphone", key: "microphone", kind: "microphone", name: "Microphone", enabled: true,
    });
    expect(next.detachedSessionSidecars).toEqual(["microphone"]);
    expect(resolveSidecarLinks(next, editorData, "base-video").map((link) => link.id)).not.toContain("microphone");
    expect(resolveSidecarLinks(next, editorData, "base-video").map((link) => link.id)).toContain("system-audio");
  });

  it("removes a group id from every member when an imported sidecar is detached", () => {
    const next = detachSidecarLink(composition(), "video", {
      id: "audio", kind: "clip", name: "Demo audio", enabled: true,
    });
    expect(next.layers.map((layer) => layer.groupId)).toEqual([undefined, undefined, undefined]);
  });
});
