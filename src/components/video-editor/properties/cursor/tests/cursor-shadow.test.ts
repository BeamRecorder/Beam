import { describe, expect, it } from "vitest";
import { cursorShadowOffset } from "../cursor-shadow";

describe("cursorShadowOffset", () => {
  it("centers the around shadow", () => {
    expect(cursorShadowOffset(10, "all")).toEqual({ x: 0, y: 0 });
  });

  it("moves the bottom shadow down", () => {
    expect(cursorShadowOffset(10, "bottom")).toEqual({ x: 0, y: 4 });
  });

  it("uses matching diagonal offsets", () => {
    expect(cursorShadowOffset(10, "bottom-right")).toEqual({ x: 4, y: 4 });
    expect(cursorShadowOffset(10, "top-left")).toEqual({ x: -4, y: -4 });
  });
});
