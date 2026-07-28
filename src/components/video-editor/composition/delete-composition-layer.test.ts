import { describe, expect, it } from "vitest";
import { deleteCompositionLayer } from "./delete-composition-layer";
import type { ProjectComposition } from "./composition-types";

const composition = (): ProjectComposition => ({
  media: [],
  layers: [
    { id: "left-video", kind: "video", name: "Video", assetId: "asset", startMs: 0, endMs: 2_000, enabled: true, order: 0, groupId: "left" },
    { id: "left-audio", kind: "audio", name: "Audio", assetId: "asset", startMs: 0, endMs: 2_000, enabled: true, order: 1, groupId: "left" },
    { id: "right-video", kind: "video", name: "Video", assetId: "asset", startMs: 2_000, endMs: 4_000, enabled: true, order: 2, groupId: "right" },
    { id: "caption", kind: "caption", name: "Caption", startMs: 0, endMs: 4_000, enabled: true, order: 3, caption: { sentences: [], style: { color: "#fff", fontSize: 12, shadowColor: "#000", shadowBlur: 0, placement: "bottom" } } },
  ],
});

describe("deleteCompositionLayer", () => {
  it("removes both halves of a linked clip", () => {
    expect(deleteCompositionLayer(composition(), "left-video").layers.map((layer) => layer.id)).toEqual(["right-video", "caption"]);
  });

  it("leaves separately cut groups intact", () => {
    expect(deleteCompositionLayer(composition(), "right-video").layers.map((layer) => layer.id)).toEqual(["left-video", "left-audio", "caption"]);
  });

  it("does not mutate or replace a composition for an unknown layer", () => {
    const value = composition();
    expect(deleteCompositionLayer(value, "missing")).toBe(value);
  });
});
