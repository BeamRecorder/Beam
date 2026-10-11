import { enableAutoUnmount, mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import Select from './Select.vue';

enableAutoUnmount(afterEach);
const options = [
  { value: 'one', label: 'First', thumbnail: '/first.png' },
  { value: 'two', label: 'Second' },
];
describe('Select trigger preview slot', () => {
  it('retains the normal thumbnail when no preview slot is provided', () => {
    const wrapper = mount(Select, { props: { modelValue: 'one', options } });
    expect(wrapper.get('.trigger-thumbnail-img').attributes('src')).toBe('/first.png');
    expect(wrapper.get('.select-label').text()).toBe('First');
  });
  it('renders a custom preview with the selected option and updates it after selection', async () => {
    const wrapper = mount(Select, {
      props: { modelValue: 'one', options },
      slots: { preview: ({ option }) => h('span', { class: 'custom-preview' }, option?.label ?? 'Empty') },
    });
    expect(wrapper.get('.custom-preview').text()).toBe('First');
    expect(wrapper.find('.trigger-thumbnail-img').exists()).toBe(false);
    await wrapper.setProps({ modelValue: 'two' });
    expect(wrapper.get('.custom-preview').text()).toBe('Second');
    await wrapper.setProps({ modelValue: null });
    expect(wrapper.get('.custom-preview').text()).toBe('Empty');
  });
  it('keeps the custom preview separate from choice labels and keyboard selection', async () => {
    const wrapper = mount(Select, {
      attachTo: document.body,
      props: { modelValue: 'one', options },
      slots: { preview: '<span class="custom-preview" />' },
    });
    await wrapper.get('.select-trigger').trigger('click');
    const choice = document.querySelectorAll<HTMLElement>('[role="option"]')[1]!;
    expect(choice.textContent).toBe('Second');
    choice.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([['two']]);
    expect(wrapper.find('.custom-preview').exists()).toBe(true);
  });
});
