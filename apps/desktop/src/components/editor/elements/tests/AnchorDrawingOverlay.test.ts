import { mount, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { provideElementEditor } from '../useElementEditor';
import type { ElementEditorContext } from '../element-editor-types';
import type { ShapeClip } from '@beam/engine/shared/composition-types';
import { MAX_VECTOR_NODES } from '@beam/engine/shared/shape-vector-schema';
import AnchorDrawingOverlay from '../AnchorDrawingOverlay.vue';
import { drawVector } from '@beam/runtime/composition/shape/render-vector';
vi.mock('@beam/runtime/composition/shape/render-vector', () => ({ drawVector: vi.fn() }));
enableAutoUnmount(afterEach);
const dispatch = (element: Element, type: string, values: Record<string, unknown> = {}) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.entries(values).forEach(([key, value]) => Object.defineProperty(event, key, { value }));
  element.dispatchEvent(event);
  return event;
};
const point = (element: Element, x: number, y: number, type = 'pointerdown', pointerId = 1) =>
  dispatch(element, type, { clientX: x, clientY: y, button: 0, pointerId });
const click = (element: Element, x: number, y: number) => {
  point(element, x, y);
  point(element, x, y, 'pointerup');
};
const fixture = (camera = {}, viewport = { x: 0, y: 0, width: 1000, height: 500 }) => {
  let editor!: ElementEditorContext;
  const layers = ref<ShapeClip[]>([]),
    selected = ref<string | null>(null);
  const dimensions = ref<{ width: number; height: number } | null>({ width: 1920, height: 1080 });
  const insert = vi.fn((clip: ShapeClip) => {
    layers.value.push(clip);
  });
  const wrapper = mount(
    defineComponent({
      setup() {
        editor = provideElementEditor({
          layers: () => layers.value,
          selectedId: () => selected.value,
          select: (id) => {
            selected.value = id;
          },
          insert,
          update: () => {},
          remove: () => {},
          timing: () => ({ startMs: 0, durationMs: 1000 }),
          canvasSize: () => dimensions.value,
        });
        editor.drawArrow();
        return () => h(AnchorDrawingOverlay, { viewport, surfaceSize: { width: 1000, height: 500 }, camera });
      },
    }),
  );
  const input = wrapper.get('.anchor-input');
  vi.spyOn(input.element, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 1000,
    height: 500,
  } as DOMRect);
  return { wrapper, input, editor, insert, dimensions };
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  for (const key of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
    if (!(key in Element.prototype))
      Object.defineProperty(Element.prototype, key, { configurable: true, value: () => true });
    vi.spyOn(Element.prototype, key as 'hasPointerCapture').mockReturnValue(true);
  }
});
afterEach(() => vi.restoreAllMocks());
describe('manual anchor drawing', () => {
  it('aligns new anchors with existing points and shows the alignment guide', async () => {
    const s = fixture();
    click(s.input.element, 100, 100);
    point(s.input.element, 103, 300, 'pointermove');
    await nextTick();
    expect(s.wrapper.findAll('.alignment-guide')).toHaveLength(1);
    click(s.input.element, 103, 300);
    expect(s.editor.anchorDraft.value?.[1]).toMatchObject({ x: 0.1, y: 0.6 });
  });
  it('places exactly three anchors regardless of pointer samples, and validates with Enter', async () => {
    const s = fixture(),
      element = s.input.element;
    click(element, 100, 100);
    point(element, 500, 200);
    for (let i = 0; i < 100; i++) point(element, 500 + i, 200 + i, 'pointermove');
    point(element, 600, 300, 'pointerup');
    click(element, 900, 400);
    await nextTick();
    expect(s.editor.anchorDraft.value).toHaveLength(3);
    expect(s.wrapper.findAll('rect')).toHaveLength(3);
    expect(s.editor.anchorDraft.value![1]).toMatchObject({ x: 0.5, y: 0.4, mode: 'smooth', out: { x: 0.6, y: 0.6 } });
    expect(s.editor.anchorDraft.value![1]!.in!.y).toBeCloseTo(0.2);
    await s.input.trigger('keydown', { key: 'Enter' });
    expect(s.insert).toHaveBeenCalledOnce();
    expect(s.insert.mock.calls[0]![0].vector!.contours[0]!.nodes).toHaveLength(3);
    expect(s.editor.drawingMode.value).toBe(false);
  });
  it('previews the next segment without storing its moving endpoint', async () => {
    const s = fixture();
    click(s.input.element, 100, 100);
    point(s.input.element, 500, 250, 'pointermove');
    await nextTick();
    expect(drawVector).toHaveBeenCalled();
    expect(s.editor.anchorDraft.value).toHaveLength(1);
    expect(s.insert).not.toHaveBeenCalled();
    await s.input.trigger('pointerleave');
    await nextTick();
    expect(s.editor.anchorDraft.value).toHaveLength(1);
  });
  it('finishes on double-click without adding a repeated final anchor', async () => {
    const s = fixture();
    click(s.input.element, 100, 100);
    click(s.input.element, 800, 300);
    click(s.input.element, 800, 300);
    await s.input.trigger('dblclick');
    expect(s.insert.mock.calls[0]![0].vector!.contours[0]!.nodes).toHaveLength(2);
  });
  it('deletes only the in-progress anchor and can collapse a dragged curve back to a corner', async () => {
    const s = fixture();
    click(s.input.element, 100, 100);
    point(s.input.element, 500, 200);
    await s.input.trigger('keydown', { key: 'Backspace' });
    expect(s.editor.anchorDraft.value).toHaveLength(1);
    point(s.input.element, 500, 200);
    point(s.input.element, 700, 300, 'pointermove');
    point(s.input.element, 500, 200, 'pointerup');
    expect(s.editor.anchorDraft.value![1]!.mode).toBe('corner');
    expect(s.editor.anchorDraft.value![1]!.out).toBeUndefined();
  });
  it('finishes during a handle drag without losing its curve or leaving pointer capture active', async () => {
    const s = fixture();
    click(s.input.element, 100, 100);
    point(s.input.element, 500, 200);
    point(s.input.element, 600, 300, 'pointermove');
    await s.input.trigger('keydown', { key: 'Enter' });
    expect(s.insert.mock.calls[0]![0].vector!.contours[0]!.nodes[1]!.mode).toBe('smooth');
    expect(Element.prototype.releasePointerCapture).toHaveBeenCalled();
  });
  it('allows removing the last anchor with Backspace or Delete and cancels with Escape', async () => {
    const s = fixture();
    click(s.input.element, 100, 100);
    click(s.input.element, 500, 300);
    const unrelated = dispatch(s.input.element, 'keydown', { key: 'a' });
    expect(unrelated.defaultPrevented).toBe(false);
    await s.input.trigger('keydown', { key: 'Backspace' });
    expect(s.editor.anchorDraft.value).toHaveLength(1);
    await s.input.trigger('keydown', { key: 'Delete' });
    expect(s.editor.anchorDraft.value).toHaveLength(0);
    await s.input.trigger('keydown', { key: 'Escape' });
    expect(s.editor.anchorDraft.value).toBeNull();
    expect(s.insert).not.toHaveBeenCalled();
  });
  it('rolls back a canceled pointer gesture and ignores foreign pointers or buttons', () => {
    const s = fixture(),
      element = s.input.element;
    dispatch(element, 'pointerdown', { button: 2, pointerId: 1 });
    expect(s.editor.anchorDraft.value).toHaveLength(0);
    click(element, 100, 100);
    point(element, 500, 200);
    point(element, 700, 300, 'pointerdown', 2);
    point(element, 700, 300, 'pointermove', 2);
    point(element, 700, 300, 'pointerup', 2);
    expect(s.editor.anchorDraft.value![1]!.mode).toBe('corner');
    dispatch(element, 'pointercancel');
    expect(s.editor.anchorDraft.value).toHaveLength(1);
    dispatch(element, 'lostpointercapture');
    expect(s.editor.anchorDraft.value).toHaveLength(1);
  });
  it('ignores tiny drags, honors canvas bounds and reverses camera zoom', () => {
    const s = fixture({ scale: 2 });
    click(s.input.element, 100, 100);
    expect(s.editor.anchorDraft.value![0]).toMatchObject({ x: 0.3, y: 0.35 });
    point(s.input.element, 900, 400);
    point(s.input.element, 901, 401, 'pointerup');
    expect(s.editor.anchorDraft.value![1]!.mode).toBe('corner');
    click(s.input.element, -5000, 5000);
    expect(s.editor.anchorDraft.value![2]).toMatchObject({ x: 0, y: 1 });
  });
  it('ignores unmeasured surfaces and stops accepting anchors at the limit', () => {
    const s = fixture();
    vi.spyOn(s.input.element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    } as DOMRect);
    click(s.input.element, 100, 100);
    point(s.input.element, 100, 100, 'pointermove');
    expect(s.editor.anchorDraft.value).toHaveLength(0);
    vi.spyOn(s.input.element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
    } as DOMRect);
    s.editor.anchorDraft.value = Array.from({ length: MAX_VECTOR_NODES }, (_, i) => ({
      id: `n${i}`,
      x: i / MAX_VECTOR_NODES,
      y: 0.5,
      mode: 'corner',
    }));
    click(s.input.element, 500, 100);
    expect(s.editor.anchorDraft.value).toHaveLength(MAX_VECTOR_NODES);
  });
  it('does not finish an incomplete path or capture clicks after cancellation', async () => {
    const s = fixture();
    click(s.input.element, 100, 100);
    await s.input.trigger('keydown', { key: 'Enter' });
    expect(s.insert).not.toHaveBeenCalled();
    click(s.input.element, 500, 200);
    expect(s.editor.anchorDraft.value).toBeNull();
  });
  it('releases an active gesture on unmount and tolerates unavailable painting', async () => {
    const s = fixture();
    point(s.input.element, 100, 100);
    s.dimensions.value = null;
    await nextTick();
    s.wrapper.unmount();
    expect(Element.prototype.releasePointerCapture).toHaveBeenCalled();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const empty = fixture();
    expect(empty.wrapper.find('canvas').exists()).toBe(true);
  });
  it('renders no input without an editor and ignores a zero-size viewport', () => {
    const missing = mount(AnchorDrawingOverlay, {
      props: { viewport: { x: 0, y: 0, width: 1000, height: 500 }, surfaceSize: { width: 1000, height: 500 } },
    });
    expect(missing.find('.anchor-input').exists()).toBe(false);
    const s = fixture({}, { x: 0, y: 0, width: 0, height: 0 });
    click(s.input.element, 100, 100);
    expect(s.editor.anchorDraft.value).toHaveLength(0);
  });
});
