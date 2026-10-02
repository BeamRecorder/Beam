import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import AddTileButton from './AddTileButton.vue';

describe('AddTileButton', () => {
  it('renders its label, plus icon and active state', () => {
    const wrapper = mount(AddTileButton, {
      props: { label: 'Custom color', active: true },
    });
    const button = wrapper.get('button');

    expect(button.attributes('type')).toBe('button');
    expect(button.attributes('aria-label')).toBe('Custom color');
    expect(button.classes()).toContain('add-tile-button');
    expect(button.classes()).toContain('active');
    expect(button.find('svg').exists()).toBe(true);
  });

  it('updates the accessible name and selection independently', async () => {
    const wrapper = mount(AddTileButton, { props: { label: 'Import image' } });
    expect(wrapper.get('button').classes()).not.toContain('active');
    await wrapper.setProps({ label: 'Import video', active: true });
    expect(wrapper.get('button').attributes('aria-label')).toBe('Import video');
    expect(wrapper.get('button').classes()).toContain('active');
  });

  it('forwards clicks to the parent', async () => {
    const onClick = vi.fn();
    const wrapper = mount(AddTileButton, {
      props: { label: 'Add gradient', onClick },
    });

    await wrapper.get('button').trigger('click');

    expect(onClick).toHaveBeenCalledOnce();
  });
});
