import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';
import StatusPill from './StatusPill.vue';

enableAutoUnmount(afterEach);
const props = { expanded: false, label: 'Export', detail: 'Walkthrough', percent: null };

it('keeps failed status dismissible without a mascot or a progress bar', async () => {
  const wrapper = mount(StatusPill, { props: { ...props, failed: true } });
  await wrapper.get('button').trigger('click');
  expect(wrapper.emitted('dismiss')).toHaveLength(1);
  expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
  expect(wrapper.find('.completion-aura').exists()).toBe(false);
});

it('announces indeterminate progress without a made-up percentage', () => {
  const wrapper = mount(StatusPill, { props });
  expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBeUndefined();
  expect(wrapper.get('.snip-pill').attributes('aria-label')).toBe('Export');
  expect(wrapper.find('.spinner').exists()).toBe(true);
  expect(wrapper.get('.snip-details').attributes('inert')).toBeDefined();
});

it('uses a static success icon without a mascot and keeps the aura until unmount', async () => {
  const wrapper = mount(StatusPill, { props: { ...props, completed: true, expanded: true } });
  expect(wrapper.find('.completion-aura').exists()).toBe(true);
  expect(wrapper.find('.mascot-melt').exists()).toBe(false);
  expect(wrapper.find('.status-value svg').exists()).toBe(true);
  expect(wrapper.get('.snip-details').attributes('inert')).toBe('false');
  await wrapper.setProps({ completed: false });
  expect(wrapper.find('.completion-aura').exists()).toBe(false);
});
