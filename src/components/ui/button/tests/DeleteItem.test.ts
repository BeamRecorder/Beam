import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DeleteItem from '../DeleteItem.vue';

describe('DeleteItem.vue', () => {
  it('renders default label and icon', () => {
    const wrapper = mount(DeleteItem, {
      props: { label: 'Delete Clip' },
    });
    expect(wrapper.text()).toBe('Delete Clip');
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('emits click event on click when confirm mode is disabled', async () => {
    const wrapper = mount(DeleteItem, {
      props: { label: 'Delete Clip' },
    });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('supports confirm mode with double click step', async () => {
    const wrapper = mount(DeleteItem, {
      props: { label: 'Delete Clip', confirm: true, confirmLabel: 'Are you sure?' },
    });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
    expect(wrapper.text()).toBe('Are you sure?');

    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });
});
