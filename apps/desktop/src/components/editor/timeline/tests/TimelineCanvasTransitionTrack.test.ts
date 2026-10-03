import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TimelineCanvasTransitionTrack from '../TimelineCanvasTransitionTrack.vue';
import type { ClipTransitions } from '@beam/engine/shared/composition-types';

const transitions: ClipTransitions = {
  entry: { preset: { kind: 'fade' }, durationMs: 200 },
  exit: { preset: { kind: 'blur' }, durationMs: 300 },
};
const geometry = {
  width: 1000,
  viewport: { left: 0, top: 0, width: 1000, height: 320 },
};

const pointerEvent = (type: string, clientX: number) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clientX', { value: clientX });
  return event;
};

let wrapper: VueWrapper | undefined;

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
});

describe('TimelineCanvasTransitionTrack', () => {
  it.each(['entry', 'exit'] as const)('opens the available %s from the sidebar', async (edge) => {
    wrapper = mount(TimelineCanvasTransitionTrack, {
      props: {
        ...geometry,
        mode: 'sidebar',
        transitions: {
          entry: edge === 'entry' ? transitions.entry : null,
          exit: edge === 'exit' ? transitions.exit : null,
        },
        durationMs: 1_000,
      },
      global: { stubs: { TimelineCanvasLane: true } },
    });
    await wrapper.get('.canvas-track-info').trigger('click');
    expect(wrapper.emitted('open')).toEqual([[edge]]);
    expect(wrapper.find('.trim-handle').exists()).toBe(false);
  });

  it('renders an empty lane without trim handles when both transitions are absent', () => {
    wrapper = mount(TimelineCanvasTransitionTrack, {
      props: { ...geometry, mode: 'track', transitions: { entry: null, exit: null }, durationMs: 0 },
      global: { stubs: { TimelineCanvasLane: true } },
    });
    expect(wrapper.getComponent({ name: 'TimelineCanvasLane' }).props('items')).toEqual([]);
    expect(wrapper.find('.trim-handle').exists()).toBe(false);
  });

  it('does not begin trimming until the track has a measurable width', async () => {
    wrapper = mount(TimelineCanvasTransitionTrack, {
      props: { ...geometry, mode: 'track', transitions, durationMs: 1_000 },
      global: { stubs: { TimelineCanvasLane: true } },
    });
    await wrapper.get('.duration-handle.end').trigger('pointerdown');
    window.dispatchEvent(pointerEvent('pointermove', 300));
    expect(wrapper.emitted('preview')).toBeUndefined();
    expect(wrapper.find('.trim-handle.active').exists()).toBe(false);
  });

  it('cancels active trimming if the component unmounts or its edge disappears', async () => {
    wrapper = mount(TimelineCanvasTransitionTrack, {
      props: { ...geometry, mode: 'track', transitions, durationMs: 1_000 },
      global: { stubs: { TimelineCanvasLane: true } },
    });
    vi.spyOn(wrapper.get('.canvas-track-content').element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 1000,
    } as DOMRect);
    await wrapper.get('.duration-handle.end').trigger('pointerdown');
    await wrapper.setProps({ transitions: { entry: null, exit: null } });
    window.dispatchEvent(pointerEvent('pointermove', 500));
    expect(wrapper.emitted('preview')).toBeUndefined();
    wrapper.unmount();
    const count = wrapper.emitted('preview')!.length;
    window.dispatchEvent(pointerEvent('pointermove', 600));
    expect(wrapper.emitted('preview')).toHaveLength(count);
    wrapper = undefined;
  });

  it('renders accessible entry and exit zones with preset and duration labels', () => {
    wrapper = mount(TimelineCanvasTransitionTrack, {
      props: { ...geometry, mode: 'track', transitions, durationMs: 1_000 },
      global: { stubs: { TimelineCanvasLane: true } },
    });

    const entry = wrapper.get('.canvas-transition-zone.entry');
    const exit = wrapper.get('.canvas-transition-zone.exit');
    expect(entry.attributes('aria-label')).toContain('fade');
    expect(entry.attributes('aria-label')).toContain('200 ms');
    expect(exit.attributes('aria-label')).toContain('blur');
    expect(exit.attributes('aria-label')).toContain('300 ms');
    expect(entry.find('.duration-handle.end').exists()).toBe(true);
    expect(entry.find('.duration-handle.start').exists()).toBe(false);
    expect(exit.find('.duration-handle.start').exists()).toBe(true);
    expect(exit.find('.duration-handle.end').exists()).toBe(false);
    expect(entry.attributes('style')).toContain('width: 20%');
    expect(exit.attributes('style')).toContain('width: 30%');
  });

  it('labels directional presets and caps their geometry at the lane width', () => {
    wrapper = mount(TimelineCanvasTransitionTrack, {
      props: {
        ...geometry,
        mode: 'track',
        durationMs: 0,
        transitions: {
          entry: { preset: { kind: 'slide', direction: 'left' }, durationMs: 200 },
          exit: { preset: { kind: 'zoom', direction: 'out' }, durationMs: 300 },
        },
      },
      global: { stubs: { TimelineCanvasLane: true } },
    });
    expect(wrapper.get('.entry').attributes('aria-label')).toContain('slide left');
    expect(wrapper.get('.exit').attributes('aria-label')).toContain('zoom out');
    expect(wrapper.get('.entry').attributes('style')).toContain('width: 100%');
  });

  it('publishes independent easing curves to the canvas lane and updates their saved parameters', async () => {
    wrapper = mount(TimelineCanvasTransitionTrack, {
      props: {
        ...geometry,
        mode: 'track',
        durationMs: 1_000,
        transitions: {
          entry: { preset: { kind: 'fade' }, durationMs: 200, easingPower: 1 },
          exit: { preset: { kind: 'fade' }, durationMs: 300, easingPower: 5 },
        },
      },
      global: { stubs: { TimelineCanvasLane: true } },
    });
    const lane = wrapper.getComponent({ name: 'TimelineCanvasLane' });
    expect(lane.props('items')).toMatchObject([
      { edge: 'entry', transition: { easingPower: 1 } },
      { edge: 'exit', transition: { easingPower: 5 } },
    ]);
    expect(wrapper.find('svg.timeline-transition-curve').exists()).toBe(false);

    await wrapper.setProps({
      transitions: {
        entry: { preset: { kind: 'fade' }, durationMs: 200, easingPower: 5 },
        exit: { preset: { kind: 'fade' }, durationMs: 300, easingPower: 5 },
      },
    });
    expect(lane.props('items')).toMatchObject([
      { edge: 'entry', transition: { easingPower: 5 } },
      { edge: 'exit', transition: { easingPower: 5 } },
    ]);
  });

  it('previews an entry resize and commits it only on pointerup', async () => {
    wrapper = mount(TimelineCanvasTransitionTrack, {
      props: { ...geometry, mode: 'track', transitions, durationMs: 1_000 },
      global: { stubs: { TimelineCanvasLane: true } },
    });
    const track = wrapper.get('.canvas-track-content').element;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 0,
      width: 1_000,
      height: 40,
      right: 1_100,
      bottom: 40,
    } as DOMRect);

    wrapper
      .get('.canvas-transition-zone.entry .duration-handle.end')
      .element.dispatchEvent(pointerEvent('pointerdown', 300));
    window.dispatchEvent(pointerEvent('pointermove', 700));
    await nextTick();
    expect(wrapper.get('.duration-handle.end').classes()).toContain('active');
    expect(wrapper.get('.trim-side-badge').text()).toBe('00.6s');

    expect(wrapper.emitted('update')).toBeUndefined();
    expect(wrapper.emitted('preview')).toContainEqual([
      {
        entry: { preset: { kind: 'fade' }, durationMs: 600 },
        exit: { preset: { kind: 'blur' }, durationMs: 300 },
      },
    ]);

    window.dispatchEvent(pointerEvent('pointerup', 700));
    await nextTick();
    expect(wrapper.find('.trim-handle.active').exists()).toBe(false);
    expect(wrapper.emitted('preview')).toContainEqual([null]);
    expect(wrapper.emitted('update')).toContainEqual([
      {
        entry: { preset: { kind: 'fade' }, durationMs: 600 },
        exit: { preset: { kind: 'blur' }, durationMs: 300 },
      },
    ]);
  });

  it.each(['pointercancel', 'blur'])('releases an active exit handle on %s without committing', async (event) => {
    wrapper = mount(TimelineCanvasTransitionTrack, {
      props: { ...geometry, mode: 'track', transitions, durationMs: 1_000 },
      global: { stubs: { TimelineCanvasLane: true } },
    });
    vi.spyOn(wrapper.get('.canvas-track-content').element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 1000,
    } as DOMRect);
    wrapper.get('.duration-handle.start').element.dispatchEvent(pointerEvent('pointerdown', 700));
    window.dispatchEvent(pointerEvent('pointermove', 600));
    await nextTick();
    expect(wrapper.get('.duration-handle.start').classes()).toContain('active');
    window.dispatchEvent(new Event(event));
    await nextTick();
    expect(wrapper.find('.trim-handle.active').exists()).toBe(false);
    expect(wrapper.emitted('update')).toBeUndefined();
    expect(wrapper.emitted('preview')!.at(-1)).toEqual([null]);
    const count = wrapper.emitted('preview')!.length;
    window.dispatchEvent(pointerEvent('pointermove', 500));
    expect(wrapper.emitted('preview')).toHaveLength(count);
  });

  it('emits the selected edge when either zone is clicked', async () => {
    wrapper = mount(TimelineCanvasTransitionTrack, {
      props: { ...geometry, mode: 'track', transitions, durationMs: 1_000 },
      global: { stubs: { TimelineCanvasLane: true } },
    });

    await wrapper.get('.canvas-transition-zone.entry').trigger('click');
    await wrapper.get('.canvas-transition-zone.exit').trigger('click');

    expect(wrapper.emitted('open')).toEqual([['entry'], ['exit']]);
  });
});
