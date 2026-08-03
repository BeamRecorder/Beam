import { describe, expect, it } from "vitest";
import { useViewportZoom } from "../useViewportZoom";

describe("useViewportZoom", () => {
  it("initializes with default 100% zoom and (0,0) pan offset", () => {
    const zoom = useViewportZoom();
    expect(zoom.zoomScale.value).toBe(1.0);
    expect(zoom.zoomPercent.value).toBe(100);
    expect(zoom.panX.value).toBe(0);
    expect(zoom.panY.value).toBe(0);
    expect(zoom.isZoomedOrPanned.value).toBe(false);
  });

  it("zooms in and out within range limits [0.25, 5.0]", () => {
    const zoom = useViewportZoom();
    zoom.zoomIn();
    expect(zoom.zoomScale.value).toBe(1.25);
    expect(zoom.isZoomedOrPanned.value).toBe(true);

    zoom.zoomOut();
    expect(zoom.zoomScale.value).toBe(1.0);

    zoom.setZoomScale(10.0);
    expect(zoom.zoomScale.value).toBe(5.0);

    zoom.setZoomScale(0.01);
    expect(zoom.zoomScale.value).toBe(0.25);
  });

  it("resets zoom scale and pan offsets", () => {
    const zoom = useViewportZoom();
    zoom.setZoomScale(2.0);
    zoom.panX.value = 150;
    zoom.panY.value = -80;
    expect(zoom.isZoomedOrPanned.value).toBe(true);

    zoom.resetZoom();
    expect(zoom.zoomScale.value).toBe(1.0);
    expect(zoom.panX.value).toBe(0);
    expect(zoom.panY.value).toBe(0);
    expect(zoom.isZoomedOrPanned.value).toBe(false);
  });

  it("calculates cursor-focused zoom transformation offsets correctly", () => {
    const zoom = useViewportZoom();
    // Zoom in from 1.0 to 2.0 at focal point (100, 100)
    zoom.setZoomScale(2.0, 100, 100);
    expect(zoom.zoomScale.value).toBe(2.0);
    expect(zoom.panX.value).toBe(-100);
    expect(zoom.panY.value).toBe(-100);
  });

  it("handles mouse wheel zoom events", () => {
    const zoom = useViewportZoom();
    const fakeRect = { left: 50, top: 50, width: 800, height: 600 } as DOMRect;

    // Wheel up -> zoom in
    const wheelUpEvent = { preventDefault: () => undefined, deltaY: -100, clientX: 250, clientY: 250 } as WheelEvent;
    zoom.handleWheel(wheelUpEvent, fakeRect);
    expect(zoom.zoomScale.value).toBeGreaterThan(1.0);

    // Wheel down -> zoom out
    const wheelDownEvent = { preventDefault: () => undefined, deltaY: 100, clientX: 250, clientY: 250 } as WheelEvent;
    zoom.handleWheel(wheelDownEvent, fakeRect);
    expect(zoom.zoomScale.value).toBeCloseTo(1.0, 2);
  });

  it("handles middle-click pointer pan", () => {
    const zoom = useViewportZoom();
    const mockElem = { setPointerCapture: () => undefined, hasPointerCapture: () => true, releasePointerCapture: () => undefined } as unknown as HTMLElement;

    const pointerDown = { button: 1, preventDefault: () => undefined, stopPropagation: () => undefined, clientX: 100, clientY: 100 } as PointerEvent;
    const handled = zoom.beginPan(pointerDown, mockElem);
    expect(handled).toBe(true);
    expect(zoom.isPanning.value).toBe(true);

    const pointerMove = { clientX: 140, clientY: 130 } as PointerEvent;
    zoom.movePan(pointerMove);
    expect(zoom.panX.value).toBe(40);
    expect(zoom.panY.value).toBe(30);

    zoom.endPan(pointerMove, mockElem);
    expect(zoom.isPanning.value).toBe(false);
  });
});
