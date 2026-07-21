import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cursorOptions,
  cursorUrls,
  useCursorReplacer,
} from "../useCursorReplacer";

class LoadingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    this.onload?.();
  }
}

class FailingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    this.onerror?.();
  }
}

describe("useCursorReplacer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("exposes the documented defaults and a complete option catalogue", () => {
    const cursor = useCursorReplacer();
    expect([
      cursor.selectedCursor.value,
      cursor.cursorSize.value,
      cursor.cursorColor.value,
      cursor.enableShadow.value,
      cursor.enableRipple.value,
      cursor.shadowBlur.value,
      cursor.shadowColor.value,
      cursor.rippleColor.value,
      cursor.rippleSize.value,
    ]).toEqual([
      "automatic",
      24,
      "#000000",
      true,
      true,
      6,
      "#000000",
      "#ff5a1f",
      30,
    ]);
    expect(cursorOptions).toHaveLength(Object.keys(cursorUrls).length);
    expect(
      cursorOptions.every(
        (option) =>
          option.value in cursorUrls && option.thumbnail.endsWith(".svg"),
      ),
    ).toBe(true);
  });

  it("loads, resizes, recolors, and releases a cursor image", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue('<svg width="12" height="14" fill="#000000"/>'),
      });
    const createObjectURL = vi.fn().mockReturnValue("blob:cursor");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("Image", LoadingImage);
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const image = await useCursorReplacer().getCursorImage(
      "default",
      32,
      "#ff00ff",
    );
    expect(image).toBeInstanceOf(LoadingImage);
    expect(fetchMock).toHaveBeenCalledWith("/macOsSvgCursors/default.svg");
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cursor");
  });

  it("fails on an unavailable asset and on an undecodable SVG", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    await expect(
      useCursorReplacer().getCursorImage("busy", 24, "#000000"),
    ).rejects.toThrow(
      "Unable to load cursor asset: /macOsSvgCursors/busy.svg (404)",
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          text: vi.fn().mockResolvedValue("<svg/>"),
        }),
    );
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("Image", FailingImage);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:bad"),
      revokeObjectURL,
    });
    await expect(
      useCursorReplacer().getCursorImage("busy", 24, "#000000"),
    ).rejects.toThrow(
      "Unable to decode cursor asset: /macOsSvgCursors/busy.svg",
    );
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:bad");
  });
});
