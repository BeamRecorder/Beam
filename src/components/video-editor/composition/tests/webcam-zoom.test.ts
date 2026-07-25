import { describe, expect, it } from "vitest";
import {
  computeWebcamLayout,
  getWebcamZoomFactor,
  webcamSettingsForAppearance,
} from "../webcam/webcam-zoom";

describe("webcam zoom layout", () => {
  it("uses the inverse of the applied zoom scale", () => {
    expect(getWebcamZoomFactor(1, true)).toBe(1);
    expect(getWebcamZoomFactor(1.5, true)).toBeCloseTo(2 / 3);
    expect(getWebcamZoomFactor(3.5, true)).toBeCloseTo(1 / 3.5);
  });

  it("does not react when the setting is disabled or the scale is invalid", () => {
    expect(getWebcamZoomFactor(3, false)).toBe(1);
    expect(getWebcamZoomFactor(0, true)).toBe(1);
    expect(getWebcamZoomFactor(Number.NaN, true)).toBe(1);
  });

  it("keeps the webcam pinned to the bottom right as its size changes", () => {
    const normal = computeWebcamLayout(1000, 800, 1);
    const zoomed = computeWebcamLayout(1000, 800, 2);
    expect(zoomed.width).toBeCloseTo(normal.width / 2);
    expect(zoomed.height).toBeCloseTo(normal.height / 2);
    expect(zoomed.x + zoomed.width).toBeCloseTo(normal.x + normal.width);
    expect(zoomed.y + zoomed.height).toBeCloseTo(normal.y + normal.height);
  });

  it("enforces the minimum overlay size on a heavily zoomed small canvas", () => {
    const layout = computeWebcamLayout(80, 80, 20);
    expect(layout.width).toBe(56);
    expect(layout.height).toBe(56);
    expect(layout.x).toBeGreaterThanOrEqual(0);
    expect(layout.y).toBeGreaterThanOrEqual(0);
  });

  it("uses the persisted normalized position and size for a webcam", () => {
    const layout = computeWebcamLayout(1000, 800, 1, undefined, { x: .12, y: .34, width: .28, height: .21 });
    expect(layout).toEqual({ x: 120, y: 272, width: 280, height: 168 });
  });

  it("preserves a persisted webcam's right and bottom offsets while zooming", () => {
    const transform = { x: .56, y: .62, width: .28, height: .21 };
    const normal = computeWebcamLayout(1000, 800, 1, undefined, transform);
    const zoomed = computeWebcamLayout(1000, 800, 2, undefined, transform);
    expect(zoomed.x + zoomed.width).toBeCloseTo(normal.x + normal.width);
    expect(zoomed.y + zoomed.height).toBeCloseTo(normal.y + normal.height);
  });

  it("maps every recorded visual preset to deterministic canvas settings", () => {
    expect(webcamSettingsForAppearance({ shadowSize: "none", cornerRadius: "none" })).toMatchObject({ shadowOpacity: 0, cornerRadius: 0 });
    expect(webcamSettingsForAppearance({ shadowSize: "md", cornerRadius: "md" })).toMatchObject({ shadowOpacity: .42, cornerRadius: 14 });
    const full = webcamSettingsForAppearance({ shadowSize: "lg", cornerRadius: "full" });
    expect(full.shadowOpacity).toBe(.58);
    expect(full.cornerRadius).toBeGreaterThan(1_000_000);
  });
});
