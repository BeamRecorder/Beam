import { describe, expect, it } from "vitest";
import {
  cursorHotspotAtSize,
  cursorPositionAt,
  cursorTypeAt,
} from "../cursor-rendering";
import { frameContentRect } from "../../../composition/appearance/frames";

const cursor = (
  x: number,
  y: number,
  cursorKind: string | null = "default",
) => ({
  x,
  y,
  visible: true,
  cursorId: null,
  shapeId: null,
  cursorKind: cursorKind as never,
  hotspot: { x: 0, y: 0 },
});

describe("cursor rendering", () => {
  it("uses the recorded semantic type only when automatic is selected", () => {
    expect(cursorTypeAt("automatic", cursor(0.5, 0.5, "textcursor"))).toBe(
      "textcursor",
    );
    expect(cursorTypeAt("handpointing", cursor(0.5, 0.5, "textcursor"))).toBe(
      "handpointing",
    );
    expect(cursorTypeAt("automatic", cursor(0.5, 0.5, "custom"))).toBe(
      "default",
    );
  });

  it("keeps cursor hotspots tied to logical cursor size, not raster dimensions", () => {
    expect(cursorHotspotAtSize("default", 24)).toEqual({ x: 7.5, y: 5.25 });
    expect(cursorHotspotAtSize("default", 48)).toEqual({ x: 15, y: 10.5 });
  });

  it("uses the same framed-background and base-transform coordinates for every canvas", () => {
    expect(
      cursorPositionAt(
        cursor(0.5, 0.5),
        { width: 100, height: 50 },
        { x: 10, y: 20, width: 200, height: 200 },
        true,
        { x: 0.1, y: 0.2, width: 0.8, height: 0.6 },
      ),
    ).toEqual({ x: 110, y: 120 });
  });

  it("anchors the cursor to Safari content below the toolbar", () => {
    const rect = { x: 10, y: 20, width: 400, height: 200 };
    const content = frameContentRect(rect, "safari");
    expect(
      cursorPositionAt(
        cursor(0.5, 0.5),
        { width: 400, height: 200 },
        rect,
        false,
        undefined,
        false,
        false,
        {
          frame: "safari",
          frameShowMenu: true,
          frameShowScrollbars: true,
          frameChromeScale: 1,
        },
      ),
    ).toEqual({
      x: content.x + content.width / 2,
      y: content.y + content.height / 2,
    });
  });

  it("includes Windows 95 chrome options and scale in cursor placement", () => {
    const rect = { x: 0, y: 0, width: 400, height: 260 };
    const appearance = {
      frame: "windows-95" as const,
      frameShowMenu: true,
      frameShowScrollbars: false,
      frameChromeScale: 1.5,
    };
    const content = frameContentRect(rect, "windows-95", {
      showMenu: appearance.frameShowMenu,
      showScrollbars: appearance.frameShowScrollbars,
      chromeScale: appearance.frameChromeScale,
    });
    const position = cursorPositionAt(
      cursor(0.25, 0.75),
      { width: 400, height: 260 },
      rect,
      false,
      undefined,
      false,
      false,
      appearance,
    );
    expect(position).toEqual({
      x: content.x + content.width * 0.25,
      y: content.y + content.height * 0.75,
    });
    expect(position.y).toBeGreaterThan(0.75 * rect.height);
  });

  it("maps cropped source coordinates into the decorated content", () => {
    const rect = { x: 0, y: 0, width: 400, height: 200 };
    const content = frameContentRect(rect, "safari");
    expect(
      cursorPositionAt(
        cursor(0.5, 0.5),
        { width: 800, height: 400 },
        rect,
        false,
        undefined,
        false,
        false,
        {
          frame: "safari",
          frameShowMenu: true,
          frameShowScrollbars: true,
          frameChromeScale: 1,
        },
        { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      ),
    ).toEqual({
      x: content.x + content.width / 2,
      y: content.y + content.height / 2,
    });
  });

  it("mirrors and clamps cursor coordinates at the shared geometry boundary", () => {
    expect(
      cursorPositionAt(
        cursor(2, -0.1),
        { width: 100, height: 100 },
        { x: 0, y: 0, width: 100, height: 100 },
        false,
        undefined,
        true,
      ),
    ).toEqual({ x: 0, y: 0 });
  });
});
