import { describe, expect, it } from "vitest";
import {
  backgroundKindFor,
  createBackgroundMedia,
  groupBackgroundMedia,
} from "../backgroundMedia";

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
      { kind: "video", label: "Vidéos", items: [media[2]] },
    ]);
    expect(groupBackgroundMedia([])).toEqual([]);
  });
});
