import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Select from './Select.vue';

const options = [
  { value: 'one', label: 'First option', color: '#ff0000' },
  { value: 'two', label: 'A very long option label that changes the trigger size', thumbnail: '/preview.png' },
  { value: 'three', label: 'Loading option', loading: true },
];

describe('Select', () => {
  it('opens, previews options and emits the selected value', async () => {
    const wrapper = mount(Select, {
      attachTo: document.body,
      props: { modelValue: 'one', options, previewOnHover: true },
    });
    expect(wrapper.find('.selected-color-badge').exists()).toBe(true);
    await wrapper.get('.select-trigger').trigger('click');
    expect(wrapper.get('.select-trigger').classes()).toContain('is-open');
    expect(document.body.querySelectorAll('.select-option')).toHaveLength(3);
    expect(document.body.querySelector('.thumbnail-img')).not.toBeNull();

    const option = document.body.querySelectorAll<HTMLElement>('.select-option')[1];
    const label = option.querySelector<HTMLElement>('.option-label')!;
    Object.defineProperty(label, 'scrollWidth', { configurable: true, value: 120 });
    Object.defineProperty(label, 'clientWidth', { configurable: true, value: 20 });
    option.dispatchEvent(new Event('pointerenter', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toContainEqual(['two']);
    option.dispatchEvent(new Event('pointerleave', { bubbles: true }));
    option.click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toContainEqual(['two']);
    wrapper.unmount();
  });

  it('supports item aliases, placeholders, loading previews and disabled triggers', async () => {
    const wrapper = mount(Select, {
      props: { modelValue: null, items: options, placeholder: 'Choose an option', loading: true, disabled: true },
    });
    expect(wrapper.get('.select-label').text()).toBe('Choose an option');
    expect(wrapper.get('.select-label').classes()).toContain('is-placeholder');
    expect(wrapper.find('.selected-thumbnail-wrapper').exists()).toBe(true);
    await wrapper.get('.select-trigger').trigger('click');
    expect(wrapper.find('.select-trigger').classes()).not.toContain('is-open');
  });
});
