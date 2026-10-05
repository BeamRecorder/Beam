import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createManualZoom } from '@beam/engine/zoom/manual-zoom';
import { createGlassHighlight } from '@beam/engine/zoom/glass-highlight';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { triggerPointer } from '../../../../../../../tests/support/pointer';
import GlassHighlightSelection from '../GlassHighlightSelection.vue';
const descriptors = ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'].map(
  (key) => [key, Object.getOwnPropertyDescriptor(Element.prototype, key)] as const,
);
beforeEach(() => {
  const captures = new WeakMap<Element, Set<number>>();
  Object.defineProperties(Element.prototype, {
    setPointerCapture: {
      configurable: true,
      value(this: Element, id: number) {
        let ids = captures.get(this);
        if (!ids) captures.set(this, (ids = new Set()));
        ids.add(id);
      },
    },
    releasePointerCapture: {
      configurable: true,
      value(this: Element, id: number) {
        captures.get(this)?.delete(id);
      },
    },
    hasPointerCapture: {
      configurable: true,
      value(this: Element, id: number) {
        return captures.get(this)?.has(id) ?? false;
      },
    },
  });
});
afterEach(() => {
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(Element.prototype, key, descriptor);
    else Reflect.deleteProperty(Element.prototype, key);
  }
});
const wrappers: ReturnType<typeof mount>[] = [];
const setup = (freehand = false) => {
  const zoom: ZoomElement = {
    ...createManualZoom('lens', 0, 1000),
    effect: 'glass',
    glass: { ...createGlassHighlight(), shape: freehand ? 'freehand' : 'circle' },
  };
  const wrapper = mount(GlassHighlightSelection, {
    props: {
      zoom,
      canvasSize: { width: 1000, height: 500 },
      viewportStyle: { width: '500px', height: '250px' },
      panning: false,
    },
  });
  wrappers.push(wrapper);
  const root = wrapper.get('.glass-highlight-selection');
  vi.spyOn(root.element, 'getBoundingClientRect').mockReturnValue({
    left: 10,
    top: 20,
    width: 500,
    height: 250,
  } as DOMRect);
  return { wrapper, root, zoom };
};
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});
describe('glass selection gestures', () => {
  it('previews a move, commits once and clamps at the canvas edges', async () => {
    const { wrapper } = setup(),
      box = wrapper.get('.glass-selection-box');
    await triggerPointer(box, 'pointerdown', { clientX: 260, clientY: 145 });
    await triggerPointer(box, 'pointermove', { clientX: 1000, clientY: -100 });
    expect(wrapper.emitted('update')).toBeUndefined();
    await triggerPointer(box, 'pointerup', { clientX: 1000, clientY: -100 });
    expect(wrapper.emitted('update')).toHaveLength(1);
    expect(wrapper.emitted('update')![0]![0]).toMatchObject({ focus: { cx: 1, cy: 0 } });
    expect(wrapper.vm.draft).toBeNull();
  });
  it('cancels pointer, Escape, mode changes and stale pointers without a document edit', async () => {
    const { wrapper, root, zoom } = setup(),
      box = wrapper.get('.glass-selection-box');
    for (const action of ['pointercancel', 'lostpointercapture', 'Escape', 'panning']) {
      await triggerPointer(box, 'pointerdown', { clientX: 260, clientY: 145 });
      await triggerPointer(box, 'pointermove', { clientX: 300, clientY: 145, pointerId: 99 });
      if (action === 'Escape') await root.trigger('keydown', { key: action });
      else if (action === 'panning') await wrapper.setProps({ panning: true });
      else await triggerPointer(box, action, {});
      await triggerPointer(box, 'pointerup', { clientX: 300, clientY: 145 });
      await wrapper.setProps({ panning: false });
    }
    expect(wrapper.emitted('update')).toBeUndefined();
    await wrapper.setProps({ zoom: { ...zoom, locked: true } });
    await triggerPointer(box, 'pointerdown', { clientX: 260, clientY: 145 });
    await triggerPointer(box, 'pointerup', { clientX: 300, clientY: 145 });
    expect(wrapper.emitted('update')).toBeUndefined();
  });
  it('captures a bounded freehand contour and keeps invalid lines as uncommitted drafts', async () => {
    const { wrapper, root } = setup(true);
    await triggerPointer(root, 'pointerdown', { clientX: 100, clientY: 100 });
    await triggerPointer(root, 'pointerup', { clientX: 200, clientY: 100 });
    expect(wrapper.emitted('update')).toBeUndefined();
    await triggerPointer(root, 'pointerdown', { clientX: 100, clientY: 100 });
    await triggerPointer(root, 'pointermove', { clientX: 250, clientY: 100 });
    await triggerPointer(root, 'pointermove', { clientX: 250, clientY: 220 });
    await triggerPointer(root, 'pointerup', { clientX: 100, clientY: 220 });
    const lens = wrapper.emitted('update')![0]![0] as ZoomElement;
    expect(lens.glass!.path.length).toBeGreaterThanOrEqual(3);
    expect(lens.glass!.path.length).toBeLessThanOrEqual(128);
    expect(lens.glass!.shape).toBe('freehand');
  });
  it('supports fine pixel keyboard moves and respects locked, drawing and pan states', async () => {
    const { wrapper, root, zoom } = setup();
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])
      await root.trigger('keydown', { key, shiftKey: true });
    expect(wrapper.emitted('update')![0]![0]).toMatchObject({ focus: { cx: 0.49, cy: 0.5 } });
    expect(wrapper.emitted('update')![3]![0]).toMatchObject({ focus: { cx: 0.5, cy: 0.52 } });
    await wrapper.setProps({ zoom: { ...zoom, locked: true } });
    await root.trigger('keydown', { key: 'ArrowLeft' });
    await root.trigger('keydown', { key: 'q' });
    expect(wrapper.emitted('update')).toHaveLength(4);
  });
});
