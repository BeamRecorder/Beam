import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TimelineTrimHandle from '../TimelineTrimHandle.vue';

describe('shared timeline trim handles', () => {
  it.each(['start', 'end'] as const)(
    'keeps an idle %s handle ready for track hover without a duration badge',
    (edge) => {
      const wrapper = mount(TimelineTrimHandle, { props: { edge, title: 'Trim' } });
      expect(wrapper.classes()).toContain(edge);
      expect(wrapper.classes()).not.toContain('active');
      expect(wrapper.find('.trim-side-badge').exists()).toBe(false);
      wrapper.unmount();
    },
  );
  it('shows only the active edge with a consistent duration and limit state', async () => {
    const wrapper = mount(TimelineTrimHandle, {
      props: { edge: 'end', title: 'Trim', state: { edge: 'start', durationMs: 1500, atLimit: true } },
    });
    expect(wrapper.classes()).not.toContain('active');
    await wrapper.setProps({ state: { edge: 'end', durationMs: 1500, atLimit: true } });
    expect(wrapper.classes()).toContain('active');
    expect(wrapper.classes()).toContain('at-limit');
    expect(wrapper.get('.trim-side-badge').text()).toBe('01.5s');
    await wrapper.setProps({ state: null });
    expect(wrapper.classes()).not.toContain('active');
    wrapper.unmount();
  });
  it('emits the original pointer event and stops it from starting a clip move', async () => {
    const wrapper = mount(TimelineTrimHandle, { props: { edge: 'start', title: 'Trim beginning' } });
    const event = new MouseEvent('pointerdown', { bubbles: true });
    wrapper.element.dispatchEvent(event);
    expect(wrapper.emitted('start')).toEqual([[event]]);
    expect(wrapper.attributes('title')).toBe('Trim beginning');
    wrapper.unmount();
  });
});
