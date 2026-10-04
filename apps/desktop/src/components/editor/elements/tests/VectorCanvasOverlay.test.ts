import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { shape } from '@beam/runtime/composition/shape/tests/gpu-shape.fixtures';
import { vectorFromSvg } from '@beam/engine/shared/shape-vector-svg';
import type { LayerRotation3d } from '@beam/engine/layout/layer-perspective-types';
import type { ElementEditorContext } from '../element-editor-types';
import { provideElementEditor } from '../useElementEditor';
import { propertyInteractionActive, resetPropertyInteractions } from '~/composables/property-interaction';
import VectorCanvasOverlay from '../VectorCanvasOverlay.vue';
const wrappers: VueWrapper[] = [];
let capture = vi.fn<(id: number) => void>(),
  release = vi.fn<(id: number) => void>();
const mountOverlay = (editing = true, closed = false, rotation3d?: LayerRotation3d) => {
  const layers = ref([
    shape({
      fillEnabled: true,
      vector: vectorFromSvg(closed ? 'M0 0L1 0L1 1Z' : 'M0 0C.3 .8 .7 .1 1 1'),
      transform: { x: 0.1, y: 0.2, width: 0.4, height: 0.4 },
    }),
  ]);
  const selected = ref<string | null>('shape'),
    allowed = ref(true);
  let editor!: ElementEditorContext;
  const Host = defineComponent({
    setup() {
      editor = provideElementEditor({
        layers: () => layers.value,
        selectedId: () => selected.value,
        select: (id) => {
          selected.value = id;
        },
        insert: () => {},
        remove: () => {},
        timing: () => ({ startMs: 0, durationMs: 1000 }),
        canvasSize: () => ({ width: 1000, height: 500 }),
        canInteract: () => allowed.value,
        update: (id, patch) => {
          layers.value = layers.value.map((c) => (c.id === id ? { ...c, ...patch } : c));
        },
      });
      if (editing) editor.beginVector();
      return () =>
        h(VectorCanvasOverlay, {
          viewport: { x: 0, y: 0, width: 1000, height: 500 },
          surfaceSize: { width: 1000, height: 500 },
          rotation3d,
        });
    },
  });
  const wrapper = mount(Host, { attachTo: document.body });
  wrappers.push(wrapper);
  const surface = wrapper.find('.vector-overlay');
  if (surface.exists())
    vi.spyOn(surface.element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
    } as DOMRect);
  return { wrapper, editor, layers, selected, allowed };
};
beforeEach(() => {
  resetPropertyInteractions();
  capture = vi.fn<(id: number) => void>();
  release = vi.fn<(id: number) => void>();
  for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'])
    if (!(name in Element.prototype))
      Object.defineProperty(Element.prototype, name, { configurable: true, value: () => false });
  vi.spyOn(Element.prototype, 'setPointerCapture').mockImplementation(capture);
  vi.spyOn(Element.prototype, 'releasePointerCapture').mockImplementation(release);
  vi.spyOn(Element.prototype, 'hasPointerCapture').mockReturnValue(true);
});
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  vi.restoreAllMocks();
  resetPropertyInteractions();
});
const pointer = (x: number, y: number, patch = {}) => ({ button: 0, pointerId: 7, clientX: x, clientY: y, ...patch });
const dispatch = async (target: { element: Element }, type: string, options: Record<string, unknown> = {}) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(options)) Object.defineProperty(event, key, { value });
  target.element.dispatchEvent(event);
  await nextTick();
};
describe('canvas anchor editing', () => {
  it('focuses point editing immediately so keyboard confirmation works after opening it', async () => {
    const s = mountOverlay();
    expect(document.activeElement).toBe(s.wrapper.get('.vector-overlay').element);
    await s.wrapper.get('.vector-overlay').trigger('keydown', { key: 'Enter' });
    expect(s.editor.vectorEditing.value).toBeNull();
  });
  it('inserts a smooth point by clicking the path without moving the existing anchors', async () => {
    const s = mountOverlay(),
      original = s.layers.value[0]!.vector!;
    await dispatch(s.wrapper.get('.vector-overlay'), 'pointerdown', pointer(300, 192.5));
    const nodes = s.layers.value[0]!.vector!.contours[0]!.nodes;
    expect(nodes).toHaveLength(3);
    expect(nodes[1]!.mode).toBe('smooth');
    expect(nodes[1]!.x).toBeCloseTo(0.5, 4);
    expect(nodes[1]!.y).toBeCloseTo(0.4625, 4);
    expect(nodes[0]).toMatchObject({ x: original.contours[0]!.nodes[0]!.x, y: original.contours[0]!.nodes[0]!.y });
    expect(nodes.at(-1)).toMatchObject({ x: 1, y: 1 });
    expect(s.editor.selectedNode.value).toEqual({ contour: 0, node: 1 });
    expect(propertyInteractionActive.value).toBe(false);
  });
  it('adds a smooth point beside the path and keeps its world position when bounds expand', async () => {
    const s = mountOverlay();
    await dispatch(s.wrapper.get('.vector-overlay'), 'pointerdown', pointer(700, 400));
    const c = s.layers.value[0]!,
      n = c.vector!.contours[0]!.nodes[s.editor.selectedNode.value!.node]!;
    expect(n.mode).toBe('smooth');
    expect((c.transform.x + n.x * c.transform.width) * 1000).toBeCloseTo(700);
    expect((c.transform.y + n.y * c.transform.height) * 500).toBeCloseTo(400);
    expect(propertyInteractionActive.value).toBe(false);
  });
  it('allows free placement with Alt and retains point editing on repeated canvas clicks', async () => {
    const s = mountOverlay(),
      surface = s.wrapper.get('.vector-overlay');
    await dispatch(surface, 'pointerdown', pointer(498, 398, { altKey: true }));
    const c = s.layers.value[0]!,
      node = c.vector!.contours[0]!.nodes[s.editor.selectedNode.value!.node]!;
    expect((c.transform.x + node.x * c.transform.width) * 1000).toBeCloseTo(498);
    await surface.trigger('click');
    await surface.trigger('dblclick');
    expect(s.editor.vectorEditing.value).toBe('shape');
    expect(c.vector!.contours[0]!.nodes).toHaveLength(3);
  });
  it('ignores insertion on an unmeasured surface and at the stored anchor limit', async () => {
    const s = mountOverlay(),
      surface = s.wrapper.get('.vector-overlay');
    vi.spyOn(surface.element, 'getBoundingClientRect').mockReturnValue({ width: 0, height: 0 } as DOMRect);
    await dispatch(surface, 'pointerdown', pointer(300, 200));
    expect(s.layers.value[0]!.vector!.contours[0]!.nodes).toHaveLength(2);
    vi.spyOn(surface.element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
    } as DOMRect);
    const c = s.layers.value[0]!;
    s.layers.value = [
      {
        ...c,
        vector: {
          ...c.vector!,
          contours: [
            {
              closed: false,
              nodes: Array.from({ length: 1024 }, (_, i) => ({
                id: `many-${i}`,
                x: i / 1023,
                y: 0.5,
                mode: 'smooth' as const,
              })),
            },
          ],
        },
      },
    ];
    await nextTick();
    await dispatch(surface, 'pointerdown', pointer(300, 350));
    expect(s.layers.value[0]!.vector!.contours[0]!.nodes).toHaveLength(1024);
  });
  it('aligns dragged anchors with others and shows guides until release', async () => {
    const s = mountOverlay(),
      anchor = s.wrapper.get('.anchor');
    await dispatch(anchor, 'pointerdown', pointer(100, 100));
    await dispatch(anchor, 'pointermove', pointer(497, 103));
    expect(s.layers.value[0]!.vector!.contours[0]!.nodes[0]!.x).toBeCloseTo(1);
    expect(s.wrapper.findAll('.snap-guide')).toHaveLength(1);
    await dispatch(anchor, 'pointerup', pointer(497, 103));
    expect(s.wrapper.findAll('.snap-guide')).toHaveLength(0);
  });
  it('selects existing anchors near clicks and rejects secondary clicks or unavailable edits', async () => {
    const s = mountOverlay(),
      surface = s.wrapper.get('.vector-overlay');
    await dispatch(surface, 'pointerdown', pointer(503, 300));
    expect(s.layers.value[0]!.vector!.contours[0]!.nodes).toHaveLength(2);
    expect(s.editor.selectedNode.value?.node).toBe(1);
    await dispatch(surface, 'pointerdown', pointer(300, 200, { button: 2 }));
    expect(s.layers.value[0]!.vector!.contours[0]!.nodes).toHaveLength(2);
    s.allowed.value = false;
    await nextTick();
    expect(s.editor.vectorEditing.value).toBeNull();
  });
  it('shows anchors only in edit mode and reveals selected curve handles', async () => {
    const hidden = mountOverlay(false);
    expect(hidden.wrapper.find('.vector-overlay').exists()).toBe(false);
    const state = mountOverlay();
    expect(state.wrapper.findAll('.anchor:not(.handle)')).toHaveLength(2);
    expect(state.wrapper.findAll('.handle')).toHaveLength(1);
    await state.wrapper.findAll('.anchor:not(.handle)')[1]!.trigger('focus');
    expect(state.editor.selectedNode.value).toEqual({ contour: 0, node: 1 });
    expect(state.wrapper.findAll('.handle')).toHaveLength(1);
  });
  it('moves a single anchor, expands bounds on release and creates one undo interaction', async () => {
    const state = mountOverlay();
    const anchor = state.wrapper.find('.anchor');
    await dispatch(anchor, 'pointerdown', pointer(100, 100));
    expect(propertyInteractionActive.value).toBe(true);
    await dispatch(anchor, 'pointermove', pointer(60, 80));
    expect(state.layers.value[0]!.vector!.contours[0]!.nodes[0]!.x).toBeCloseTo(-0.1);
    await dispatch(anchor, 'pointerup', pointer(60, 80));
    expect(state.layers.value[0]!.transform.x).toBeCloseTo(0.06);
    expect(state.layers.value[0]!.transform.y).toBeCloseTo(0.16);
    expect(propertyInteractionActive.value).toBe(false);
    expect(release).toHaveBeenCalledWith(7);
  });
  it('moves a curve handle independently with Alt without translating its anchor', async () => {
    const state = mountOverlay();
    const handle = state.wrapper.find('.handle');
    await dispatch(handle, 'pointerdown', pointer(220, 260));
    await dispatch(handle, 'pointermove', pointer(260, 240, { altKey: true }));
    const node = state.layers.value[0]!.vector!.contours[0]!.nodes[0]!;
    expect(node).toMatchObject({ x: 0, y: 0, mode: 'corner' });
    expect(node.out!.x).toBeCloseTo(0.4);
    expect(node.out!.y).toBeCloseTo(0.7);
    await dispatch(handle, 'pointerup', pointer(260, 240, { altKey: true }));
  });
  it.each(['pointercancel', 'lostpointercapture'])('rolls back canceled gestures on %s', async (event) => {
    const state = mountOverlay();
    const before = JSON.stringify(state.layers.value),
      anchor = state.wrapper.find('.anchor');
    await dispatch(anchor, 'pointerdown', pointer(100, 100));
    await dispatch(anchor, 'pointermove', pointer(140, 120));
    await dispatch(anchor, event);
    expect(JSON.stringify(state.layers.value)).toBe(before);
    expect(propertyInteractionActive.value).toBe(false);
  });
  it('uses Escape to cancel a drag first and leave edit mode second', async () => {
    const state = mountOverlay(),
      anchor = state.wrapper.find('.anchor');
    await dispatch(anchor, 'pointerdown', pointer(100, 100));
    await dispatch(anchor, 'pointermove', pointer(140, 120));
    await anchor.trigger('keydown', { key: 'Escape' });
    expect(state.layers.value[0]!.vector!.contours[0]!.nodes[0]!.x).toBe(0);
    expect(state.editor.vectorEditing.value).toBe('shape');
    await anchor.trigger('keydown', { key: 'Escape' });
    expect(state.editor.vectorEditing.value).toBeNull();
  });
  it.each(['Delete', 'Backspace'])(
    'removes only the selected point with %s and retains a valid contour',
    async (key) => {
      const state = mountOverlay(true, true),
        anchor = state.wrapper.find('.anchor');
      await anchor.trigger('keydown', { key });
      expect(state.layers.value[0]!.vector!.contours[0]!.nodes).toHaveLength(2);
      await anchor.trigger('keydown', { key });
      expect(state.layers.value[0]!.vector!.contours[0]!.nodes).toHaveLength(2);
    },
  );
  it('ignores secondary buttons, stale pointers and repeated pointer starts', async () => {
    const state = mountOverlay(),
      anchor = state.wrapper.find('.anchor');
    await dispatch(anchor, 'pointerdown', pointer(100, 100, { button: 2 }));
    expect(capture).not.toHaveBeenCalled();
    await dispatch(anchor, 'pointermove', pointer(140, 120));
    expect(state.layers.value[0]!.vector!.contours[0]!.nodes[0]!.x).toBe(0);
    await dispatch(anchor, 'pointerdown', pointer(100, 100));
    await dispatch(anchor, 'pointerdown', pointer(100, 100));
    expect(capture).toHaveBeenCalledTimes(1);
    await dispatch(anchor, 'pointermove', pointer(140, 120, { pointerId: 8 }));
    await dispatch(anchor, 'pointerup', pointer(140, 120, { pointerId: 8 }));
    expect(propertyInteractionActive.value).toBe(true);
    await dispatch(anchor, 'pointercancel');
  });
  it('cleans up capture when selection disappears or the overlay unmounts', async () => {
    const state = mountOverlay(),
      anchor = state.wrapper.find('.anchor');
    await dispatch(anchor, 'pointerdown', pointer(100, 100));
    state.selected.value = null;
    await nextTick();
    expect(propertyInteractionActive.value).toBe(false);
    const next = mountOverlay();
    await dispatch(next.wrapper.find('.anchor'), 'pointerdown', pointer(100, 100));
    next.wrapper.unmount();
    expect(propertyInteractionActive.value).toBe(false);
  });
});

it('keeps clicks and double clicks on anchor controls inside the vector editor', async () => {
  const state = mountOverlay();
  for (const target of [state.wrapper.find('.anchor'), state.wrapper.find('.handle')]) {
    await target.trigger('click');
    await target.trigger('dblclick');
  }
  expect(state.editor.vectorEditing.value).toBe('shape');
  expect(state.editor.editing.value).toBeNull();
});
it('finishes point editing with Enter without rolling back an active anchor drag', async () => {
  const state = mountOverlay(),
    anchor = state.wrapper.find('.anchor');
  await dispatch(anchor, 'pointerdown', pointer(100, 100));
  await dispatch(anchor, 'pointermove', pointer(140, 120));
  const moved = state.layers.value[0]!.vector;
  await anchor.trigger('keydown', { key: 'Enter' });
  expect(state.editor.vectorEditing.value).toBeNull();
  expect(state.layers.value[0]!.vector!.contours[0]!.nodes[0]!.x).toBeCloseTo(moved!.contours[0]!.nodes[0]!.x);
  expect(propertyInteractionActive.value).toBe(false);
});
it('finishes point editing with Enter when no gesture is active', async () => {
  const state = mountOverlay();
  await state.wrapper.find('.anchor').trigger('keydown', { key: 'Enter' });
  expect(state.editor.vectorEditing.value).toBeNull();
  expect(propertyInteractionActive.value).toBe(false);
});

it('retains the 3D pivot when editing curves outside the original rectangle', async () => {
  const state = mountOverlay(true, false, { x: 12, y: 24, perspective: 800 });
  const before = { ...state.layers.value[0]!.transform },
    anchor = state.wrapper.find('.anchor');
  await dispatch(anchor, 'pointerdown', pointer(100, 100));
  await dispatch(anchor, 'pointermove', pointer(40, 80));
  await dispatch(anchor, 'pointerup', pointer(40, 80));
  expect(state.layers.value[0]!.transform).toEqual(before);
  expect(propertyInteractionActive.value).toBe(false);
});
