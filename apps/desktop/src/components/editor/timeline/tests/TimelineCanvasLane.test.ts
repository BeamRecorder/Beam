import { createTimelineFrameQueue } from '@beam/runtime/timeline/frame-queue';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import TimelineCanvasLane from '../TimelineCanvasLane.vue';
import { TIMELINE_SURFACE_KEY } from '../timeline-surface-types';
import type { TimelineSurfaceLane } from '../timeline-surface-types';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const props = { items: [], width: 6000, durationMs: 60000, viewport: { left: 0, top: 0, width: 1000, height: 320 } };
function setup() {
  const release = vi.fn(),
    invalidate = vi.fn();
  let lane: TimelineSurfaceLane;
  const surface = {
    frames: createTimelineFrameQueue({ request: requestAnimationFrame, cancel: cancelAnimationFrame }),
    canvas: ref(null),
    context: () => null,
    invalidate,
    register(value: TimelineSurfaceLane) {
      lane = value;
      return release;
    },
  };
  const wrapper = mount(TimelineCanvasLane, {
    props,
    global: { provide: { [TIMELINE_SURFACE_KEY as symbol]: surface } },
  });
  return { wrapper, release, invalidate, lane: () => lane! };
}
it('registers a lane without allocating another bitmap or animation clock', () => {
  const state = setup();
  expect(state.wrapper.find('canvas').exists()).toBe(false);
  expect(state.lane().element).toBe(state.wrapper.element);
  expect(state.lane().props.width).toBe(6000);
  state.wrapper.unmount();
  expect(state.release).toHaveBeenCalledOnce();
});
it('invalidates the shared surface when viewport or authored content changes', async () => {
  const state = setup();
  await state.wrapper.setProps({ viewport: { ...props.viewport, left: 120 } });
  expect(state.invalidate).toHaveBeenCalledOnce();
  expect(state.lane().props.viewport.left).toBe(120);
  state.wrapper.unmount();
});
it('requires an owning surface explicitly', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(() => mount(TimelineCanvasLane, { props })).toThrow('shared surface');
});
