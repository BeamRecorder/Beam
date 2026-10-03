import { mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import TimelineReorderGroup from '../TimelineReorderGroup.vue';
import ReorderGroup from '~/ui/transitions/ReorderGroup.vue';
import { TIMELINE_SURFACE_KEY } from '../timeline-surface-types';

it('displays additions immediately and forwards motion ownership to the shared canvas', () => {
  const followMoves = vi.fn();
  const wrapper = mount(TimelineReorderGroup, {
    props: { order: ['a'] },
    global: { provide: { [TIMELINE_SURFACE_KEY as symbol]: { followMoves } } },
  });
  const group = wrapper.getComponent(ReorderGroup);
  expect(group.props('animateMembership')).toBe(false);
  group.vm.$emit('moving', true);
  group.vm.$emit('moving', false);
  expect(followMoves.mock.calls[0]![0]).toBe(followMoves.mock.calls[1]![0]);
  expect(followMoves.mock.calls.map((call) => call[1])).toEqual([true, false]);
  wrapper.unmount();
  expect(followMoves.mock.calls.at(-1)![1]).toBe(false);
});
it('releases an ongoing move when its group unmounts', () => {
  const followMoves = vi.fn();
  const wrapper = mount(TimelineReorderGroup, {
    props: { order: ['a'] },
    global: { provide: { [TIMELINE_SURFACE_KEY as symbol]: { followMoves } } },
  });
  wrapper.getComponent(ReorderGroup).vm.$emit('moving', true);
  wrapper.unmount();
  expect(followMoves.mock.calls.map((call) => call[1])).toEqual([true, false]);
});
it('requires the canvas owner rather than silently desynchronizing DOM and artwork', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(() => mount(TimelineReorderGroup, { props: { order: [] } })).toThrow('shared surface');
  warn.mockRestore();
});
