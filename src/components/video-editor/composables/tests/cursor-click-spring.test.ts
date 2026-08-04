import { describe, expect, it } from "vitest";
import { cursorClickSpringScale } from "../cursor-click-spring";

describe("cursorClickSpringScale", () => {
  it("starts and ends at its resting scale", () => {
    expect(cursorClickSpringScale(0, true)).toBe(1);
    expect(cursorClickSpringScale(0.42, true)).toBe(1);
  });
  it("has a visible press followed by a rebound", () => {
    expect(cursorClickSpringScale(0.07, true)).toBe(0.85);
    expect(cursorClickSpringScale(0.18, true)).toBeGreaterThan(1);
  });
  it("does nothing when disabled", () =>
    expect(cursorClickSpringScale(0.14, false)).toBe(1));
  it("scales the rebound intensity independently", () => {
    expect(cursorClickSpringScale(0.07, true, 0)).toBe(1);
    expect(cursorClickSpringScale(0.07, true, 50)).toBeCloseTo(0.85);
    expect(cursorClickSpringScale(0.07, true, 100)).toBeCloseTo(0.7);
  });
});
