import { effectScope, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScreenshotLayerReorder } from '../composition/useScreenshotLayerReorder';

class PointerCaptureTarget extends EventTarget {
  private readonly capturedPointers = new Set<number>();
  readonly setPointerCapture = vi.fn((pointerId: number) => this.capturedPointers.add(pointerId));
  readonly hasPointerCapture = vi.fn((pointerId: number) => this.capturedPointers.has(pointerId));
  readonly releasePointerCapture = vi.fn((pointerId: number) => this.capturedPointers.delete(pointerId));
}

const makeList = (bounds = { top: 0, bottom: 240 }, rowHeight = 40, hasRow = true) => {
  let scrollTop = 0;
  const row = { offsetHeight: rowHeight } as HTMLElement;
  const list = Object.assign(new PointerCaptureTarget(), {
    getBoundingClientRect: () => ({ ...bounds, height: bounds.bottom - bounds.top }),
    querySelector: vi.fn(() => (hasRow ? row : null)),
  }) as unknown as HTMLElement & PointerCaptureTarget;
  Object.defineProperty(list, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
  return { list, row, getScrollTop: () => scrollTop };
};

const pointer = (button: number, pointerId: number, clientY: number, target = new PointerCaptureTarget()) => ({
  event: {
    button,
    pointerId,
    clientY,
    currentTarget: target,
    preventDefault: vi.fn(),
  } as unknown as PointerEvent,
  target,
});

const dispatchPointer = (type: 'pointermove' | 'pointerup' | 'pointercancel', pointerId: number, clientY: number) => {
  const event = new Event(type);
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientY: { value: clientY },
  });
  window.dispatchEvent(event);
  return event;
};

let callbacks: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let requestFrame: ReturnType<typeof vi.spyOn>;
let cancelFrame: ReturnType<typeof vi.spyOn>;

const runFrame = () => {
  const entry = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
  if (!entry) throw new Error('No animation frame is scheduled.');
  callbacks.delete(entry[0]);
  entry[1](performance.now());
};

beforeEach(() => {
  callbacks = new Map();
  nextFrameId = 1;
  requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextFrameId++;
    callbacks.set(id, callback);
    return id;
  });
  cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    callbacks.delete(id);
  });
});

afterEach(() => vi.restoreAllMocks());

describe('useScreenshotLayerReorder', () => {
  it('waits for a four pixel drag threshold without capturing the pointer or committing a click', () => {
    const { list } = makeList();
    const scope = effectScope();
    const commit = vi.fn();
    const state = scope.run(() => useScreenshotLayerReorder(ref(list), () => ['back', 'middle', 'front'], commit))!;
    const { event, target: grip } = pointer(0, 1, 20);

    state.begin(event, 'middle');
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(list.setPointerCapture).not.toHaveBeenCalled();
    expect(grip.setPointerCapture).not.toHaveBeenCalled();

    dispatchPointer('pointermove', 1, 23);
    expect(state.dragging.value).toBeNull();
    expect(state.preview.value).toBeNull();
    expect(requestFrame).not.toHaveBeenCalled();

    dispatchPointer('pointerup', 1, 23);
    expect(commit).not.toHaveBeenCalled();
    expect(list.releasePointerCapture).not.toHaveBeenCalled();
    expect(state.dragging.value).toBeNull();
    scope.stop();
  });

  it('previews movement after the threshold and commits the requested front-to-back index', () => {
    const { list } = makeList();
    const scope = effectScope();
    const commit = vi.fn();
    const state = scope.run(() => useScreenshotLayerReorder(ref(list), () => ['top', 'middle', 'bottom'], commit))!;
    const { event } = pointer(0, 2, 40);

    state.begin(event, 'middle');
    dispatchPointer('pointermove', 2, 100);
    expect(state.dragging.value).toBe('middle');
    expect(state.preview.value).toEqual(['top', 'middle', 'bottom']);
    expect(list.setPointerCapture).toHaveBeenCalledWith(2);
    runFrame();
    expect(state.preview.value).toEqual(['top', 'bottom', 'middle']);

    dispatchPointer('pointerup', 2, 100);
    expect(commit).toHaveBeenCalledWith('middle', 2);
    expect(state.preview.value).toBeNull();
    expect(state.dragging.value).toBeNull();
    scope.stop();
  });

  it('does not commit an active gesture that returns to its initial row', () => {
    const { list } = makeList();
    const scope = effectScope();
    const commit = vi.fn();
    const state = scope.run(() => useScreenshotLayerReorder(ref(list), () => ['top', 'middle', 'bottom'], commit))!;
    const { event } = pointer(0, 12, 50);

    state.begin(event, 'middle');
    dispatchPointer('pointermove', 12, 55);
    runFrame();
    expect(state.preview.value).toEqual(['top', 'middle', 'bottom']);
    dispatchPointer('pointerup', 12, 55);
    expect(commit).not.toHaveBeenCalled();
    scope.stop();
  });

  it.each(['pointercancel', 'escape'] as const)('cancels the preview on %s without committing', (cancelType) => {
    const { list } = makeList();
    const scope = effectScope();
    const commit = vi.fn();
    const state = scope.run(() => useScreenshotLayerReorder(ref(list), () => ['one', 'two'], commit))!;
    const { event } = pointer(0, 3, 30);

    state.begin(event, 'one');
    dispatchPointer('pointermove', 3, 40);
    expect(state.dragging.value).toBe('one');
    dispatchPointer('pointercancel', 99, 40);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(state.dragging.value).toBe('one');

    if (cancelType === 'pointercancel') dispatchPointer('pointercancel', 3, 40);
    else {
      const keydown = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      window.dispatchEvent(keydown);
      expect(keydown.defaultPrevented).toBe(true);
    }

    expect(commit).not.toHaveBeenCalled();
    expect(state.preview.value).toBeNull();
    expect(state.dragging.value).toBeNull();
    expect(list.releasePointerCapture).toHaveBeenCalledWith(3);
    expect(cancelFrame).toHaveBeenCalled();
    dispatchPointer('pointerup', 3, 100);
    expect(commit).not.toHaveBeenCalled();
    scope.stop();
  });

  it('cancels and releases the active drag when the window loses focus', () => {
    const { list } = makeList();
    const scope = effectScope();
    const commit = vi.fn();
    const state = scope.run(() => useScreenshotLayerReorder(ref(list), () => ['one', 'two'], commit))!;
    const { event } = pointer(0, 14, 20);

    state.begin(event, 'one');
    dispatchPointer('pointermove', 14, 60);
    runFrame();
    expect(state.preview.value).toEqual(['two', 'one']);

    window.dispatchEvent(new Event('blur'));

    expect(state.preview.value).toBeNull();
    expect(state.dragging.value).toBeNull();
    expect(list.releasePointerCapture).toHaveBeenCalledWith(14);
    expect(commit).not.toHaveBeenCalled();
    expect(cancelFrame).toHaveBeenCalled();
    scope.stop();
  });

  it('cancels without releasing capture after the stable list loses pointer capture', () => {
    const { list } = makeList();
    const scope = effectScope();
    const commit = vi.fn();
    const state = scope.run(() => useScreenshotLayerReorder(ref(list), () => ['one', 'two'], commit))!;
    const { event } = pointer(0, 15, 20);

    state.begin(event, 'one');
    dispatchPointer('pointermove', 15, 60);
    runFrame();
    list.hasPointerCapture.mockReturnValue(false);
    const lostCapture = new Event('lostpointercapture');
    Object.defineProperty(lostCapture, 'pointerId', { value: 15 });
    list.dispatchEvent(lostCapture);

    expect(state.preview.value).toBeNull();
    expect(state.dragging.value).toBeNull();
    expect(list.releasePointerCapture).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(cancelFrame).toHaveBeenCalled();
    scope.stop();
  });

  it('does not release a pointer capture that the browser already dropped', () => {
    const { list } = makeList();
    const scope = effectScope();
    const state = scope.run(() => useScreenshotLayerReorder(ref(list), () => ['one'], vi.fn()))!;
    const { event } = pointer(0, 13, 20);
    list.hasPointerCapture.mockReturnValue(false);

    state.begin(event, 'one');
    dispatchPointer('pointercancel', 13, 20);

    expect(list.hasPointerCapture).toHaveBeenCalledWith(13);
    expect(list.releasePointerCapture).not.toHaveBeenCalled();
    scope.stop();
  });

  it('keeps tracking after Vue moves the dragged grip row while capture remains on the list', () => {
    const { list } = makeList();
    const scope = effectScope();
    const commit = vi.fn();
    const state = scope.run(() => useScreenshotLayerReorder(ref(list), () => ['one', 'two', 'three', 'four'], commit))!;
    const { event, target: grip } = pointer(0, 21, 20);

    state.begin(event, 'two');
    dispatchPointer('pointermove', 21, 170);
    runFrame();
    expect(state.preview.value).toEqual(['one', 'three', 'four', 'two']);
    expect(list.setPointerCapture).toHaveBeenCalledWith(21);
    expect(grip.setPointerCapture).not.toHaveBeenCalled();

    // Reordering the keyed row can detach and reinsert its grip. The stable list owns capture,
    // so an event from the moved grip does not cancel the gesture.
    const movedGripCaptureLoss = new Event('lostpointercapture');
    Object.defineProperty(movedGripCaptureLoss, 'pointerId', { value: 21 });
    grip.dispatchEvent(movedGripCaptureLoss);
    expect(state.dragging.value).toBe('two');
    expect(state.preview.value).toEqual(['one', 'three', 'four', 'two']);

    dispatchPointer('pointermove', 21, 180);
    runFrame();
    dispatchPointer('pointerup', 21, 180);

    expect(commit).toHaveBeenCalledWith('two', 3);
    expect(list.releasePointerCapture).toHaveBeenCalledWith(21);
    scope.stop();
  });

  it('ignores non-left and concurrent gestures, plus events from another pointer', () => {
    const { list } = makeList();
    const scope = effectScope();
    const commit = vi.fn();
    const state = scope.run(() => useScreenshotLayerReorder(ref(list), () => ['one', 'two'], commit))!;
    const rightButton = pointer(2, 4, 20);
    state.begin(rightButton.event, 'one');
    expect(list.setPointerCapture).not.toHaveBeenCalled();

    const first = pointer(0, 5, 20);
    const concurrent = pointer(0, 6, 20);
    state.begin(first.event, 'one');
    state.begin(concurrent.event, 'two');
    expect(list.setPointerCapture).not.toHaveBeenCalled();

    dispatchPointer('pointermove', 6, 100);
    dispatchPointer('pointerup', 6, 100);
    expect(state.dragging.value).toBeNull();
    expect(commit).not.toHaveBeenCalled();
    dispatchPointer('pointerup', 5, 20);
    expect(list.releasePointerCapture).not.toHaveBeenCalled();
    scope.stop();
  });

  it('auto-scrolls the layer list near both edges during a drag', () => {
    const topList = makeList({ top: 100, bottom: 300 });
    topList.list.scrollTop = 30;
    const scope = effectScope();
    const commit = vi.fn();
    const state = scope.run(() => useScreenshotLayerReorder(ref(topList.list), () => ['one', 'two', 'three'], commit))!;
    const topDrag = pointer(0, 7, 150);
    state.begin(topDrag.event, 'two');
    dispatchPointer('pointermove', 7, 105);
    runFrame();
    expect(topList.getScrollTop()).toBeLessThan(30);
    dispatchPointer('pointercancel', 7, 105);
    scope.stop();

    const bottomList = makeList({ top: 0, bottom: 200 });
    const bottomScope = effectScope();
    const bottomState = bottomScope.run(() =>
      useScreenshotLayerReorder(ref(bottomList.list), () => ['one', 'two', 'three'], commit),
    )!;
    const bottomDrag = pointer(0, 8, 100);
    bottomState.begin(bottomDrag.event, 'two');
    dispatchPointer('pointermove', 8, 190);
    runFrame();
    expect(bottomList.getScrollTop()).toBeGreaterThan(0);
    dispatchPointer('pointercancel', 8, 190);
    bottomScope.stop();
  });

  it('cleans up listeners, capture and pending animation frame when its Vue scope stops', () => {
    const { list } = makeList();
    const scope = effectScope();
    const commit = vi.fn();
    const state = scope.run(() => useScreenshotLayerReorder(ref(list), () => ['one', 'two'], commit))!;
    const { event } = pointer(0, 9, 20);

    state.begin(event, 'one');
    dispatchPointer('pointermove', 9, 30);
    expect(state.dragging.value).toBe('one');
    scope.stop();

    expect(state.preview.value).toBeNull();
    expect(state.dragging.value).toBeNull();
    expect(list.releasePointerCapture).toHaveBeenCalledWith(9);
    expect(cancelFrame).toHaveBeenCalled();
    dispatchPointer('pointerup', 9, 120);
    expect(commit).not.toHaveBeenCalled();
  });

  it('returns cleanly when the list or its row disappears during a gesture', () => {
    const missingRow = makeList({ top: 0, bottom: 200 }, 40, false);
    const scope = effectScope();
    const commit = vi.fn();
    const listRef = ref<HTMLElement | null>(missingRow.list);
    const state = scope.run(() => useScreenshotLayerReorder(listRef, () => ['one', 'two'], commit))!;
    const { event } = pointer(0, 10, 20);

    state.begin(event, 'one');
    dispatchPointer('pointermove', 10, 30);
    expect(() => runFrame()).not.toThrow();
    listRef.value = null;
    expect(() => runFrame()).not.toThrow();
    dispatchPointer('pointercancel', 10, 30);
    scope.stop();
  });

  it('ignores invalid layer ids and does not capture a pointer when the list is absent', () => {
    const scope = effectScope();
    const commit = vi.fn();
    const listRef = ref<HTMLElement | null>(null);
    const state = scope.run(() => useScreenshotLayerReorder(listRef, () => ['one', 'two'], commit))!;
    const { event } = pointer(0, 11, 20);

    state.begin(event, 'one');
    const availableList = makeList().list;
    listRef.value = availableList;
    state.begin(event, 'missing');

    expect(availableList.setPointerCapture).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    scope.stop();
  });
});
