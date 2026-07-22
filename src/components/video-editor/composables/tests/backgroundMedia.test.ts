import { describe, expect, it } from "vitest";
import {
  backgroundKindFor,
  createBackgroundMedia,
  groupBackgroundMedia,
  customColor,
  customGradient,
  normalizeBackgroundValue,
} from "../backgroundCatalog";

describe("background media", () => {
  it("classifies every supported extension case-insensitively", () => {
    expect(
      ["avif", "bmp", "jpeg", "jpg", "png", "webp"].map((extension) =>
        backgroundKindFor(`/media/file.${extension.toUpperCase()}`),
      ),
    ).toEqual(["image", "image", "image", "image", "image", "image"]);
    expect(backgroundKindFor("/media/animation.gif")).toBeNull();
    expect(
      ["m4v", "mov", "mp4", "ogv", "webm"].map((extension) =>
        backgroundKindFor(`/media/file.${extension}`),
      ),
    ).toEqual(["video", "video", "video", "video", "video"]);
  });

  it("rejects paths with no supported extension", () => {
    expect(backgroundKindFor("/media/file.txt")).toBeNull();
    expect(backgroundKindFor("/media/no-extension")).toBeNull();
    expect(backgroundKindFor("")).toBeNull();
    expect(backgroundKindFor("/media/.hidden")).toBeNull();
  });

  it("deduplicates, filters, normalizes names, and sorts media", () => {
    expect(
      createBackgroundMedia([
        "/media/zebra_video.MP4",
        "/media/my_background-image.png",
        "/media/zebra_video.MP4",
        "/media/ignore.txt",
      ]),
    ).toEqual([
      {
        id: "/media/my_background-image.png",
        name: "My Background Image",
        path: "/media/my_background-image.png",
        extension: "png",
        kind: "image",
      },
      {
        id: "/media/zebra_video.MP4",
        name: "Zebra Video",
        path: "/media/zebra_video.MP4",
        extension: "mp4",
        kind: "video",
      },
    ]);
  });

  it("supports paths without a directory segment", () => {
    expect(createBackgroundMedia(["plain_name.png"])).toEqual([
      {
        id: "plain_name.png",
        name: "Plain Name",
        path: "plain_name.png",
        extension: "png",
        kind: "image",
      },
    ]);
  });

  it("groups media in display order and excludes empty groups", () => {
    const media = createBackgroundMedia([
      "/z.mp4",
      "/b.png",
      "/c.jpg",
    ]);
    expect(groupBackgroundMedia(media)).toEqual([
      { kind: "image", label: "Images", items: [media[0], media[1]] },
      { kind: "video", label: "Videos", items: [media[2]] },
    ]);
    expect(groupBackgroundMedia([])).toEqual([]);
  });

  it("normalizes custom color and gradients into typed background values", () => {
    expect(customColor("#123456")).toMatchObject({ kind: "color", color: "#123456" });
    expect(customGradient({ type: "linear", angle: 450, stops: [{ id: "a", position: 0, color: "#000000", alpha: 1 }, { id: "b", position: 1, color: "#ffffff", alpha: 1 }] }).gradient.angle).toBe(90);
    expect(normalizeBackgroundValue({ kind: "gradient", gradient: { stops: [] } })).toMatchObject({ kind: "gradient", gradient: { stops: [{ position: 0 }, { position: 1 }] } });
  });

  it("rejects malformed persisted background values", () => {
    expect(normalizeBackgroundValue({ kind: "color", color: "red" })).toBeNull();
    expect(normalizeBackgroundValue({ kind: "video", path: "/wrong.png" })).toBeNull();
    expect(normalizeBackgroundValue(null)).toBeNull();
  });
});
