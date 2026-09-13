import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue';
import type { ShapeClip } from '~/media/shared/composition-types';
import { createElementText } from '~/media/shared/element-text';
import { normalizeShapeLayerStyle } from '~/media/shared/shape-layer-style';
import type { ShapeLayerStyle } from '~/media/shared/shape-layer-types';
import type { ElementEditorContext } from '../element-editor-types';
import { provideElementEditor } from '../useElementEditor';
import ElementCanvasOverlay from '../ElementCanvasOverlay.vue';
import { MAX_DRAWING_POINTS } from '~/media/shared/freehand';
import {
  beginPropertyInteraction,
  endPropertyInteraction,
  propertyInteractionActive,
  resetPropertyInteractions,
} from '~/composables/property-interaction';

const createTextClip = (id: string, content = 'Original'): ShapeClip => ({
  ...normalizeShapeLayerStyle({ family: 'text', preset: 'text', text: createElementText(content) }),
  id,
  trackId: id,
  kind: 'shape',
  assetId: '',
  name: 'Text',
  enabled: true,
  order: 0,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  transform: { x: 0.2, y: 0.2, width: 0.5, height: 0.3 },
});

const wrappers: VueWrapper[] = [];
let previousPointerCapture: PropertyDescriptor | undefined;
let previousDevicePixelRatio: PropertyDescriptor | undefined;
let setPointerCapture: ReturnType<typeof vi.fn>;
let drawingContext: CanvasRenderingContext2D;
let drawingPreviewHasInk: boolean;
let currentPathHasSegments: boolean;

const mountOverlay = (startEditing = false, viewport = { x: 0, y: 0, width: 1_000, height: 500 }) => {
  const viewportState = ref(viewport);
  const initial = createTextClip('text-layer');
  const layers = shallowRef<ShapeClip[]>([initial]);
  const selectedId = ref<string | null>(initial.id);
  const insert = vi.fn((clip: ShapeClip) => {
    layers.value = [...layers.value, clip];
  });
  const select = vi.fn((id: string) => {
    selectedId.value = id;
  });
  const update = vi.fn((id: string, patch: Partial<ShapeLayerStyle>) => {
    layers.value = layers.value.map((clip) => (clip.id === id ? { ...clip, ...patch } : clip));
  });
  const remove = vi.fn((id: string) => {
    layers.value = layers.value.filter((clip) => clip.id !== id);
  });
  let editor!: ElementEditorContext;
  const Host = defineComponent({
    setup() {
      editor = provideElementEditor({
        layers: () => layers.value,
        selectedId: () => selectedId.value,
        select,
        insert,
        update,
        remove,
        timing: () => ({ startMs: 0, durationMs: 1_000 }),
      });
      if (startEditing) editor.beginText(initial.id);
      return () => {
        const currentViewport = viewportState.value;
        return h(ElementCanvasOverlay, {
          viewport: currentViewport,
          surfaceSize: { width: currentViewport.width, height: currentViewport.height },
        });
      };
    },
  });
  const wrapper = mount(Host);
  wrappers.push(wrapper);
  return { wrapper, editor, layers, insert, update, initial, viewport: viewportState };
};

const dispatch = (target: Element, type: string, values: Record<string, unknown> = {}) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(event, key, { configurable: true, value });
  }
  target.dispatchEvent(event);
  return event;
};

const setSurfaceBounds = (wrapper: VueWrapper, bounds = { left: 10, top: 20, width: 500, height: 250 }) => {
  vi.spyOn(wrapper.get('.element-overlay').element, 'getBoundingClientRect').mockReturnValue({
    x: bounds.left,
    y: bounds.top,
    left: bounds.left,
    top: bounds.top,
    right: bounds.left + bounds.width,
    bottom: bounds.top + bounds.height,
    width: bounds.width,
    height: bounds.height,
    toJSON: () => ({}),
  } as DOMRect);
};

beforeEach(() => {
  resetPropertyInteractions();
  vi.stubGlobal('crypto', { randomUUID: () => 'drawn-element' });
  drawingPreviewHasInk = false;
  currentPathHasSegments = false;
  drawingContext = {
    beginPath: vi.fn(() => {
      currentPathHasSegments = false;
    }),
    moveTo: vi.fn(() => {
      currentPathHasSegments = true;
    }),
    lineTo: vi.fn(() => {
      currentPathHasSegments = true;
    }),
    bezierCurveTo: vi.fn(() => {
      currentPathHasSegments = true;
    }),
    stroke: vi.fn(() => {
      if (currentPathHasSegments) drawingPreviewHasInk = true;
    }),
    scale: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(() => {
      drawingPreviewHasInk = false;
    }),
    measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(drawingContext);
  previousPointerCapture = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'setPointerCapture');
  previousDevicePixelRatio = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
  setPointerCapture = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: setPointerCapture,
  });
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  resetPropertyInteractions();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (previousPointerCapture) {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', previousPointerCapture);
  } else {
    delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  }
  if (previousDevicePixelRatio) {
    Object.defineProperty(window, 'devicePixelRatio', previousDevicePixelRatio);
  } else {
    Reflect.deleteProperty(window, 'devicePixelRatio');
  }
});

describe('ElementCanvasOverlay', () => {
  it('stays inert when mounted without an editor provider', () => {
    const wrapper = mount(ElementCanvasOverlay, {
      props: {
        viewport: { x: 0, y: 0, width: 1_000, height: 500 },
        surfaceSize: { width: 1_000, height: 500 },
      },
    });
    wrappers.push(wrapper);

    expect(wrapper.find('.element-overlay').exists()).toBe(true);
    expect(wrapper.find('.drawing-input').exists()).toBe(false);
    expect(wrapper.find('.text-frame').exists()).toBe(false);
  });

  it('shows no editing surface when the editor has no selected layer', () => {
    const { wrapper, editor } = mountOverlay();
    editor.select('missing-layer');

    expect(editor.selected.value).toBeNull();
    expect(wrapper.find('.text-frame').exists()).toBe(false);
  });

  it('lays out text with the fallback measurer when canvas text measurement is unavailable', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { wrapper } = mountOverlay(true);
    await nextTick();

    expect(wrapper.get('.text-frame').attributes('style')).toContain('width: 500px');
    expect(wrapper.get('textarea').element.value).toBe('Original');
  });

  it('keeps canvas text edits as a draft until the inline editor finishes', async () => {
    vi.useFakeTimers();
    const { wrapper, editor, layers, update } = mountOverlay(true);
    await flushPromises();
    const textarea = wrapper.get('textarea');

    await textarea.setValue('Committed from canvas');
    expect(editor.editing.value?.text?.content).toBe('Original');
    vi.advanceTimersByTime(150);
    await nextTick();

    expect(editor.editing.value?.text?.content).toBe('Committed from canvas');
    expect(update).not.toHaveBeenCalled();
    await textarea.trigger('keydown', { key: 'Enter', ctrlKey: true });

    expect(update).toHaveBeenCalledWith('text-layer', {
      text: expect.objectContaining({ content: 'Committed from canvas' }),
    });
    expect(layers.value[0]?.text?.content).toBe('Committed from canvas');
    expect(editor.editing.value).toBeNull();
  });

  it('discards the inline editor draft on Escape without changing the stored layer', async () => {
    vi.useFakeTimers();
    const { wrapper, editor, layers, update, initial } = mountOverlay(true);
    await flushPromises();
    const textarea = wrapper.get('textarea');

    await textarea.setValue('Discard this edit');
    vi.advanceTimersByTime(150);
    await nextTick();
    expect(editor.editing.value?.text?.content).toBe('Discard this edit');

    await textarea.trigger('keydown', { key: 'Escape' });

    expect(editor.editing.value).toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(layers.value[0]).toBe(initial);
    expect(layers.value[0]?.text?.content).toBe('Original');
  });

  it('uses coalesced pointer samples and inserts a finished freehand stroke', async () => {
    const { wrapper, editor, insert } = mountOverlay();
    editor.add('drawing');
    await nextTick();
    setSurfaceBounds(wrapper);
    const input = wrapper.get('.drawing-input').element;

    dispatch(input, 'pointerdown', { button: 0, pointerId: 17, clientX: 35, clientY: 45 });
    expect(setPointerCapture).toHaveBeenCalledWith(17);
    dispatch(input, 'pointermove', {
      pointerId: 17,
      getCoalescedEvents: () => [
        { clientX: 60, clientY: 70 },
        { clientX: 85, clientY: 95 },
      ],
    });
    expect(insert).not.toHaveBeenCalled();
    dispatch(input, 'pointerup', { pointerId: 17, clientX: 110, clientY: 120 });

    expect(insert).toHaveBeenCalledOnce();
    expect(insert.mock.calls[0]![0]).toMatchObject({
      family: 'drawing',
      preset: 'freehand',
      timelineDurationMs: 1_000,
      drawing: {
        points: expect.any(Array),
        smoothing: 65,
        strokeWidth: 8,
      },
    });
    expect(insert.mock.calls[0]![0].drawing?.points).toHaveLength(4);
  });

  it('clears the temporary preview after committing and deleting a drawing without another stroke', async () => {
    const { wrapper, editor, layers } = mountOverlay();
    editor.add('drawing');
    await nextTick();
    setSurfaceBounds(wrapper);
    const input = wrapper.get('.drawing-input').element;

    dispatch(input, 'pointerdown', { button: 0, pointerId: 71, clientX: 35, clientY: 45 });
    dispatch(input, 'pointermove', { pointerId: 71, clientX: 85, clientY: 95 });
    expect(drawingPreviewHasInk).toBe(true);

    dispatch(input, 'pointerup', { pointerId: 71, clientX: 110, clientY: 120 });
    expect(layers.value.some((layer) => layer.family === 'drawing')).toBe(true);
    // A real canvas keeps its current path after clearRect; clearing preview pixels must not stroke it again.
    expect(currentPathHasSegments).toBe(true);
    expect(drawingPreviewHasInk).toBe(false);

    editor.remove();
    expect(layers.value.some((layer) => layer.family === 'drawing')).toBe(false);
    expect(drawingPreviewHasInk).toBe(false);
  });

  it('clears canceled drawing preview pixels even though clearRect preserves the current path', async () => {
    const { wrapper, editor, insert } = mountOverlay();
    editor.add('drawing');
    await nextTick();
    setSurfaceBounds(wrapper);
    const input = wrapper.get('.drawing-input').element;

    dispatch(input, 'pointerdown', { button: 0, pointerId: 72, clientX: 35, clientY: 45 });
    dispatch(input, 'pointermove', { pointerId: 72, clientX: 85, clientY: 95 });
    expect(drawingPreviewHasInk).toBe(true);

    dispatch(input, 'pointercancel', { pointerId: 72 });

    expect(currentPathHasSegments).toBe(true);
    expect(drawingPreviewHasInk).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('keeps a drawing interaction active through pointerup and ignores duplicate finish events', async () => {
    const { wrapper, editor } = mountOverlay();
    editor.add('drawing');
    await nextTick();
    setSurfaceBounds(wrapper);
    const input = wrapper.get('.drawing-input').element;

    // Simulate another property control dragging at the same time.
    beginPropertyInteraction();
    dispatch(input, 'pointerdown', { button: 0, pointerId: 18, clientX: 35, clientY: 45 });
    expect(propertyInteractionActive.value).toBe(true);

    dispatch(input, 'pointerup', { pointerId: 18, clientX: 85, clientY: 95 });
    expect(propertyInteractionActive.value).toBe(true);

    // Late pointer capture events must not close the independent transaction.
    dispatch(input, 'pointerup', { pointerId: 18, clientX: 85, clientY: 95 });
    dispatch(input, 'pointercancel', { pointerId: 18 });
    dispatch(input, 'lostpointercapture', { pointerId: 18 });
    expect(propertyInteractionActive.value).toBe(true);

    endPropertyInteraction();
    expect(propertyInteractionActive.value).toBe(false);
  });

  it('releases the drawing interaction on pointer cancellation without releasing twice', async () => {
    const { wrapper, editor } = mountOverlay();
    editor.add('drawing');
    await nextTick();
    setSurfaceBounds(wrapper);
    const input = wrapper.get('.drawing-input').element;

    dispatch(input, 'pointerdown', { button: 0, pointerId: 19, clientX: 35, clientY: 45 });
    expect(propertyInteractionActive.value).toBe(true);

    dispatch(input, 'pointercancel', { pointerId: 19 });
    expect(propertyInteractionActive.value).toBe(false);
    dispatch(input, 'pointerup', { pointerId: 19, clientX: 85, clientY: 95 });
    dispatch(input, 'lostpointercapture', { pointerId: 19 });
    expect(propertyInteractionActive.value).toBe(false);
  });

  it('closes only the drawing interaction when the overlay unmounts mid-stroke', async () => {
    const { wrapper, editor } = mountOverlay();
    editor.add('drawing');
    await nextTick();
    setSurfaceBounds(wrapper);
    const input = wrapper.get('.drawing-input').element;

    beginPropertyInteraction();
    dispatch(input, 'pointerdown', { button: 0, pointerId: 22, clientX: 35, clientY: 45 });
    expect(propertyInteractionActive.value).toBe(true);

    const trackedIndex = wrappers.indexOf(wrapper);
    if (trackedIndex >= 0) wrappers.splice(trackedIndex, 1);
    wrapper.unmount();

    expect(propertyInteractionActive.value).toBe(true);
    endPropertyInteraction();
    expect(propertyInteractionActive.value).toBe(false);
  });

  it('ignores non-left and competing pointers and falls back to the event when coalesced samples are absent', async () => {
    const { wrapper, editor, insert } = mountOverlay();
    editor.add('drawing');
    await nextTick();
    setSurfaceBounds(wrapper);
    const input = wrapper.get('.drawing-input').element;

    dispatch(input, 'pointerdown', { button: 2, pointerId: 10, clientX: 35, clientY: 45 });
    expect(setPointerCapture).not.toHaveBeenCalled();
    dispatch(input, 'pointerdown', { button: 0, pointerId: 10, clientX: 35, clientY: 45 });
    dispatch(input, 'pointerdown', { button: 0, pointerId: 11, clientX: 60, clientY: 70 });
    expect(setPointerCapture).toHaveBeenCalledOnce();

    dispatch(input, 'pointermove', { pointerId: 11, clientX: 100, clientY: 100 });
    dispatch(input, 'pointerup', { pointerId: 11, clientX: 100, clientY: 100 });
    expect(insert).not.toHaveBeenCalled();

    dispatch(input, 'pointermove', { pointerId: 10, clientX: 35, clientY: 45 });
    dispatch(input, 'pointerup', { pointerId: 10, clientX: 35, clientY: 45 });

    expect(insert).toHaveBeenCalledOnce();
    expect(insert.mock.calls[0]![0].drawing?.points).toHaveLength(1);
  });

  it.each(['pointercancel', 'lostpointercapture'] as const)(
    'clears an active pointer after %s so a later stroke can finish',
    async (cancelEvent) => {
      const { wrapper, editor, insert } = mountOverlay();
      editor.add('drawing');
      await nextTick();
      setSurfaceBounds(wrapper);
      const input = wrapper.get('.drawing-input').element;

      dispatch(input, 'pointerdown', { button: 0, pointerId: 20, clientX: 35, clientY: 45 });
      dispatch(input, cancelEvent, { pointerId: 20 });
      dispatch(input, 'pointerup', { pointerId: 20, clientX: 85, clientY: 95 });
      expect(insert).not.toHaveBeenCalled();

      dispatch(input, 'pointerdown', { button: 0, pointerId: 21, clientX: 35, clientY: 45 });
      dispatch(input, 'pointerup', { pointerId: 21, clientX: 85, clientY: 95 });
      expect(insert).toHaveBeenCalledOnce();
    },
  );

  it('cancels the active pointer when drawing mode is disabled', async () => {
    const { wrapper, editor, insert } = mountOverlay();
    editor.add('drawing');
    await nextTick();
    setSurfaceBounds(wrapper);
    let input = wrapper.get('.drawing-input').element;

    editor.drawingMode.value = false;
    dispatch(input, 'pointerdown', { button: 0, pointerId: 30, clientX: 35, clientY: 45 });
    expect(setPointerCapture).not.toHaveBeenCalled();
    await nextTick();

    editor.add('drawing');
    await nextTick();
    input = wrapper.get('.drawing-input').element;
    dispatch(input, 'pointerdown', { button: 0, pointerId: 31, clientX: 35, clientY: 45 });
    editor.drawingMode.value = false;
    await nextTick();
    dispatch(input, 'pointerup', { pointerId: 31, clientX: 85, clientY: 95 });

    expect(insert).not.toHaveBeenCalled();
    expect(editor.drawingMode.value).toBe(false);
  });

  it('clamps pointer-captured samples that fall outside the canvas frame', async () => {
    const { wrapper, editor, insert } = mountOverlay();
    editor.add('drawing');
    await nextTick();
    setSurfaceBounds(wrapper);
    const input = wrapper.get('.drawing-input').element;

    dispatch(input, 'pointerdown', { button: 0, pointerId: 40, clientX: -490, clientY: -105 });
    dispatch(input, 'pointermove', {
      pointerId: 40,
      getCoalescedEvents: () => [{ clientX: 510, clientY: 270 }],
    });
    dispatch(input, 'pointerup', { pointerId: 40, clientX: 510, clientY: 270 });

    const inserted = insert.mock.calls[0]![0];
    expect(insert).toHaveBeenCalledOnce();
    expect(inserted.transform.x).toBeGreaterThan(-0.01);
    expect(inserted.transform.y).toBeGreaterThan(-0.02);
    expect(inserted.transform.x + inserted.transform.width).toBeLessThan(1.02);
    expect(inserted.transform.y + inserted.transform.height).toBeLessThan(1.04);
    expect(
      inserted.drawing?.points.every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1),
    ).toBe(true);
  });

  it('caps drawing preview DPR and resizes its backing canvas when the viewport changes', async () => {
    const { wrapper, editor, viewport } = mountOverlay();
    editor.add('drawing');
    await nextTick();
    setSurfaceBounds(wrapper);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 0 });
    const input = wrapper.get('.drawing-input').element;
    dispatch(input, 'pointerdown', { button: 0, pointerId: 50, clientX: 35, clientY: 45 });
    const canvas = wrapper.get('.drawing-preview').element as HTMLCanvasElement;
    expect(canvas.width).toBe(1_000);
    expect(canvas.height).toBe(500);

    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
    viewport.value = { x: 0, y: 0, width: 800, height: 400 };
    await nextTick();
    dispatch(input, 'pointermove', { pointerId: 50, clientX: 60, clientY: 70 });

    expect(canvas.width).toBe(1_600);
    expect(canvas.height).toBe(800);
    expect(drawingContext.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
  });

  it('simplifies an overlong stroke while retaining the final pointer sample', async () => {
    const { wrapper, editor, insert } = mountOverlay(false, { x: 0, y: 0, width: 10_000, height: 10_000 });
    Object.defineProperty(drawingContext, 'bezierCurveTo', { value: () => undefined });
    editor.add('drawing');
    await nextTick();
    setSurfaceBounds(wrapper, { left: 0, top: 0, width: 10_000, height: 10_000 });
    const input = wrapper.get('.drawing-input').element;
    const samples = Array.from({ length: MAX_DRAWING_POINTS - 1 }, (_, index) => {
      const point = ((index + 1) * 10_000) / (MAX_DRAWING_POINTS - 1);
      return { clientX: point, clientY: point };
    });

    dispatch(input, 'pointerdown', { button: 0, pointerId: 60, clientX: 0, clientY: 0 });
    dispatch(input, 'pointermove', { pointerId: 60, getCoalescedEvents: () => samples });
    dispatch(input, 'pointerup', { pointerId: 60, clientX: 10_000, clientY: 10_000 });

    const drawing = insert.mock.calls[0]![0].drawing!;
    expect(insert).toHaveBeenCalledOnce();
    expect(drawing.points).toHaveLength(MAX_DRAWING_POINTS / 2 + 1);
    expect(drawing.points.at(-1)!.x).toBeGreaterThan(0.99);
    expect(drawing.points.at(-1)!.y).toBeGreaterThan(0.99);
  });

  it('still completes a stroke when the preview canvas has no 2D context', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { wrapper, editor, insert } = mountOverlay();
    editor.add('drawing');
    await nextTick();
    setSurfaceBounds(wrapper);
    const input = wrapper.get('.drawing-input').element;

    dispatch(input, 'pointerdown', { button: 0, pointerId: 70, clientX: 35, clientY: 45 });
    dispatch(input, 'pointerup', { pointerId: 70, clientX: 85, clientY: 95 });

    expect(insert).toHaveBeenCalledOnce();
  });

  it('cancels an active stroke with Escape and exits drawing mode on the next Escape', async () => {
    const { wrapper, editor, insert } = mountOverlay();
    editor.add('drawing');
    await nextTick();
    setSurfaceBounds(wrapper);
    const input = wrapper.get('.drawing-input').element;

    dispatch(input, 'pointerdown', { button: 0, pointerId: 3, clientX: 35, clientY: 45 });
    dispatch(input, 'pointermove', {
      pointerId: 3,
      getCoalescedEvents: () => [{ clientX: 85, clientY: 95 }],
    });
    dispatch(input, 'keydown', { key: 'Escape' });

    expect(insert).not.toHaveBeenCalled();
    expect(editor.drawingMode.value).toBe(true);
    dispatch(input, 'keydown', { key: 'Escape' });
    await nextTick();

    expect(editor.drawingMode.value).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});
