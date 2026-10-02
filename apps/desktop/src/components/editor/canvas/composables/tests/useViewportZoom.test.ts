import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { useViewportZoom } from '../useViewportZoom';

const wrappers: VueWrapper[] = [];
const mountedZoom = () => {
  let zoom!: ReturnType<typeof useViewportZoom>;
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          zoom = useViewportZoom();
          return () => h('div');
        },
      }),
    ),
  );
  return zoom;
};
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});

describe('useViewportZoom', () => {
  it('initializes with default 100% zoom and (0,0) pan offset', () => {
    const zoom = mountedZoom();
    expect(zoom.zoomScale.value).toBe(1.0);
    expect(zoom.zoomPercent.value).toBe(100);
    expect(zoom.panX.value).toBe(0);
    expect(zoom.panY.value).toBe(0);
    expect(zoom.isZoomedOrPanned.value).toBe(false);
    expect(zoom.viewportStyle.value.transform).toBe('translate3d(0px, 0px, 0) scale(1)');
    expect(zoom.isOutOfBounds.value).toBe(false);
  });

  it('zooms in and out within range limits [0.25, 5.0]', () => {
    const zoom = mountedZoom();
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

  it('resets zoom scale and pan offsets', () => {
    const zoom = mountedZoom();
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

  it('calculates cursor-focused zoom transformation offsets correctly', () => {
    const zoom = mountedZoom();
    // Zoom in from 1.0 to 2.0 at focal point (100, 100)
    zoom.setZoomScale(2.0, 100, 100);
    expect(zoom.zoomScale.value).toBe(2.0);
    expect(zoom.panX.value).toBe(-100);
    expect(zoom.panY.value).toBe(-100);
  });

  it('handles mouse wheel zoom events', () => {
    const zoom = mountedZoom();
    const fakeRect = { left: 50, top: 50, width: 800, height: 600 } as DOMRect;

    // Wheel up -> zoom in
    const wheelUpEvent = {
      preventDefault: () => undefined,
      deltaY: -100,
      clientX: 250,
      clientY: 250,
    } as WheelEvent;
    zoom.handleWheel(wheelUpEvent, fakeRect);
    expect(zoom.zoomScale.value).toBeGreaterThan(1.0);

    // Wheel down -> zoom out
    const wheelDownEvent = {
      preventDefault: () => undefined,
      deltaY: 100,
      clientX: 250,
      clientY: 250,
    } as WheelEvent;
    zoom.handleWheel(wheelDownEvent, fakeRect);
    expect(zoom.zoomScale.value).toBeCloseTo(1.0, 2);
  });

  it('handles middle-click pointer pan', () => {
    const zoom = mountedZoom();
    const mockElem = {
      setPointerCapture: () => undefined,
      hasPointerCapture: () => true,
      releasePointerCapture: () => undefined,
    } as unknown as HTMLElement;

    const pointerDown = {
      button: 1,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
      clientX: 100,
      clientY: 100,
    } as PointerEvent;
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

  it('zooms in both directions with a horizontal mouse wheel while retaining the pointer focus', () => {
    const zoom = mountedZoom();
    const rect = { left: 50, top: 50 } as DOMRect;
    const left = new WheelEvent('wheel', { deltaX: -100, clientX: 250, clientY: 250, cancelable: true });
    zoom.handleWheel(left, rect);
    expect(left.defaultPrevented).toBe(true);
    expect(zoom.zoomScale.value).toBeCloseTo(1.12);
    expect(zoom.panX.value).toBeCloseTo(-24);
    expect(zoom.panY.value).toBeCloseTo(-24);
    zoom.handleWheel(new WheelEvent('wheel', { deltaX: 100, clientX: 250, clientY: 250 }), rect);
    expect(zoom.zoomScale.value).toBeCloseTo(1);
    expect(zoom.panX.value).toBeCloseTo(0);
    expect(zoom.panY.value).toBeCloseTo(0);
  });

  it.each([
    [-100, 1, 1.12],
    [100, -1, 1 / 1.12],
    [-1, 100, 1 / 1.12],
    [1, -100, 1.12],
    [-100, 100, 1 / 1.12],
    [100, -100, 1.12],
  ])('uses the dominant axis for mixed deltas (%s, %s), preferring vertical on ties', (deltaX, deltaY, scale) => {
    const zoom = mountedZoom();
    zoom.handleWheel(new WheelEvent('wheel', { deltaX, deltaY }));
    expect(zoom.zoomScale.value).toBeCloseTo(scale);
  });

  it('ignores zero and invalid motion instead of introducing zoom or pan', () => {
    const zoom = mountedZoom();
    zoom.panX.value = 30;
    zoom.panY.value = -40;
    for (const [deltaX, deltaY] of [
      [0, 0],
      [-0, -0],
      [Infinity, 0],
      [0, NaN],
    ])
      zoom.handleWheel({ deltaX, deltaY, preventDefault: vi.fn() } as unknown as WheelEvent);
    expect(zoom.zoomScale.value).toBe(1);
    expect([zoom.panX.value, zoom.panY.value]).toEqual([30, -40]);
  });

  it('keeps horizontal wheel navigation bounded without shifting the view at either zoom limit', () => {
    const zoom = mountedZoom(),
      rect = { left: 0, top: 0 } as DOMRect;
    zoom.setZoomScale(5);
    zoom.handleWheel(new WheelEvent('wheel', { deltaX: -100, clientX: 100, clientY: 100 }), rect);
    expect(zoom.zoomScale.value).toBe(5);
    expect([zoom.panX.value, zoom.panY.value]).toEqual([0, 0]);
    zoom.setZoomScale(0.25);
    zoom.handleWheel(new WheelEvent('wheel', { deltaX: 100, clientX: 100, clientY: 100 }), rect);
    expect(zoom.zoomScale.value).toBe(0.25);
    expect([zoom.panX.value, zoom.panY.value]).toEqual([0, 0]);
  });

  it('preserves pan and recenter behavior during navigation and ignores inactive drags', () => {
    const zoom = mountedZoom();
    const move = { clientX: 50, clientY: 50 } as PointerEvent;
    zoom.movePan(move);
    zoom.endPan(move);
    zoom.isPanning.value = true;
    zoom.movePan(move);
    zoom.endPan(move);
    const start = {
      button: 0,
      clientX: 20,
      clientY: 30,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent;
    expect(zoom.beginPan(start)).toBe(false);
    zoom.isSpacePressed.value = true;
    expect(zoom.beginPan(start)).toBe(true);
    zoom.movePan(move);
    expect([zoom.panX.value, zoom.panY.value]).toEqual([30, 20]);
    const target = { hasPointerCapture: () => false, releasePointerCapture: vi.fn() } as unknown as HTMLElement;
    zoom.endPan(move, target);
    expect(target.releasePointerCapture).not.toHaveBeenCalled();
    zoom.setZoomScale(1, 100);
    zoom.panX.value = 161;
    expect(zoom.isOutOfBounds.value).toBe(true);
    zoom.panX.value = 0;
    zoom.panY.value = -161;
    expect(zoom.isOutOfBounds.value).toBe(true);
    zoom.resetZoom();
    expect(zoom.isOutOfBounds.value).toBe(false);
    expect(zoom.viewportStyle.value.transform).toBe('translate3d(0px, 0px, 0) scale(1)');
  });

  it('handles Space pan shortcuts and detaches listeners on disposal', () => {
    const zoom = mountedZoom();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA' }));
    expect(zoom.isSpacePressed.value).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(zoom.isSpacePressed.value).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a' }));
    expect(zoom.isSpacePressed.value).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    expect(zoom.isSpacePressed.value).toBe(false);
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(null);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(zoom.isSpacePressed.value).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
    wrappers.pop()!.unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(zoom.isSpacePressed.value).toBe(false);
  });

  it.each(['input', 'textarea', 'select', 'editable'])('does not start Space panning while editing %s', (tag) => {
    const zoom = mountedZoom();
    const element = document.createElement(tag === 'editable' ? 'div' : tag);
    if (tag === 'editable') {
      element.setAttribute('contenteditable', 'true');
      element.tabIndex = 0;
    }
    document.body.append(element);
    try {
      element.focus();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      expect(zoom.isSpacePressed.value).toBe(false);
    } finally {
      element.remove();
    }
  });
});
