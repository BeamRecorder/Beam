import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StillZoomSelection from '../StillZoomSelection.vue';
import { createManualZoom } from '@beam/engine/zoom/manual-zoom';
import GlassHighlightSelection from '../../editor/canvas/GlassHighlightSelection.vue';
import { createGlassHighlight } from '@beam/engine/zoom/glass-highlight';
import { triggerPointer } from '../../../../../../tests/support/pointer';
const wrappers: ReturnType<typeof mount>[] = [];
const setup = () => {
  const zoom = createManualZoom('still', 0, 1);
  const wrapper = mount(StillZoomSelection, {
    props: { zoom, canvasSize: { width: 1000, height: 500 }, size: { width: 500, height: 250 }, panning: false },
  });
  wrappers.push(wrapper);
  const root = wrapper.get('.still-zoom-selection'),
    target = wrapper.get('.focus-target');
  vi.spyOn(root.element, 'getBoundingClientRect').mockReturnValue({ width: 500, height: 250 } as DOMRect);
  Object.assign(target.element, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  return { wrapper, target, zoom };
};
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});
describe('static zoom selection', () => {
  it('previews pointer movement and commits a bounded camera focus once', async () => {
    const { wrapper, target } = setup();
    await triggerPointer(target, 'pointerdown', { clientX: 100, clientY: 100 });
    await triggerPointer(target, 'pointermove', { clientX: 120, clientY: 125 });
    expect(wrapper.emitted('update')).toBeUndefined();
    await triggerPointer(target, 'pointerup', { clientX: 120, clientY: 125 });
    expect(wrapper.emitted('update')).toHaveLength(1);
    expect(wrapper.emitted('update')![0]![0]).toMatchObject({ focus: { cx: 0.54, cy: 0.6 } });
    expect(wrapper.emitted('preview')!.at(-1)).toEqual([null]);
  });
  it('cancels Escape and lost capture, ignores stale pointers and pan or lock states', async () => {
    const { wrapper, target, zoom } = setup();
    await triggerPointer(target, 'pointerdown', { clientX: 100, clientY: 100 });
    await triggerPointer(target, 'pointermove', { clientX: 200, pointerId: 99 });
    await target.trigger('keydown', { key: 'Escape' });
    await triggerPointer(target, 'pointerup', { clientX: 150 });
    await triggerPointer(target, 'pointerdown', { clientX: 100 });
    await triggerPointer(target, 'lostpointercapture', {});
    await wrapper.setProps({ panning: true });
    await triggerPointer(target, 'pointerdown', {});
    await wrapper.setProps({ panning: false, zoom: { ...zoom, locked: true } });
    await triggerPointer(target, 'pointerdown', {});
    await target.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('update')).toBeUndefined();
  });
  it('uses fine pixel keys and the shared freehand lens overlay in stills', async () => {
    const { wrapper, target, zoom } = setup();
    await target.trigger('keydown', { key: 'ArrowLeft' });
    await target.trigger('keydown', { key: 'ArrowDown', shiftKey: true });
    expect(wrapper.emitted('update')![0]![0]).toMatchObject({ focus: { cx: 0.499, cy: 0.5 } });
    expect(wrapper.emitted('update')![1]![0]).toMatchObject({ focus: { cx: 0.5, cy: 0.52 } });
    await wrapper.setProps({ zoom: { ...zoom, effect: 'glass', glass: createGlassHighlight() } });
    const overlay = wrapper.getComponent(GlassHighlightSelection);
    expect(wrapper.find('.focus-target').exists()).toBe(false);
    overlay.vm.$emit('update', { ...zoom, depth: 4 });
    expect(wrapper.emitted('update')![2]![0]).toMatchObject({ depth: 4 });
  });
});
