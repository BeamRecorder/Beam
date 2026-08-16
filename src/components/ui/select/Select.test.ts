import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import Select from './Select.vue';

const options = [
  { value: 'one', label: 'First option', color: '#ff0000' },
  { value: 'two', label: 'A very long option label that changes the trigger size', thumbnail: '/preview.png' },
  { value: 'three', label: 'Loading option', loading: true },
];

describe('Select', () => {
  it('previews on hover and focus without committing until selection', async () => {
    const wrapper = mount(Select, {
      attachTo: document.body,
      props: { modelValue: 'one', options },
    });
    expect(wrapper.find('.selected-color-badge').exists()).toBe(true);
    await wrapper.get('.select-trigger').trigger('click');
    expect(wrapper.get('.select-trigger').classes()).toContain('is-open');
    expect(document.body.querySelectorAll('.select-option')).toHaveLength(3);
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
    expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(3);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(document.body.querySelector('.thumbnail-img')).not.toBeNull();

    const option = document.body.querySelectorAll<HTMLElement>('.select-option')[1];
    const label = option.querySelector<HTMLElement>('.option-label')!;
    Object.defineProperty(label, 'scrollWidth', { configurable: true, value: 120 });
    Object.defineProperty(label, 'clientWidth', { configurable: true, value: 20 });
    await option.dispatchEvent(new Event('pointerenter', { bubbles: true }));
    expect(wrapper.emitted('preview:modelValue')).toContainEqual(['two']);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    await option.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    expect(wrapper.emitted('preview:modelValue')).toContainEqual(['two']);

    const list = document.body.querySelector<HTMLElement>('.virtual-scroll-container')!;
    await list.dispatchEvent(new Event('pointerleave', { bubbles: true }));
    expect(wrapper.emitted('preview:modelValue')).toContainEqual([null]);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    await option.click();
    expect(wrapper.emitted('update:modelValue')).toContainEqual(['two']);
    expect(wrapper.emitted('preview:modelValue')).toContainEqual([null]);
    wrapper.unmount();
  });

  it('commits with Enter and Space and cancels with Escape', async () => {
    const wrapper = mount(Select, {
      attachTo: document.body,
      props: { modelValue: 'one', options },
    });

    await wrapper.get('.select-trigger').trigger('click');
    const second = document.body.querySelectorAll<HTMLElement>('.select-option')[1];
    second.focus();
    second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toContainEqual(['two']);
    expect(wrapper.emitted('preview:modelValue')).toContainEqual([null]);

    await wrapper.get('.select-trigger').trigger('click');
    const third = document.body.querySelectorAll<HTMLElement>('.select-option')[2];
    third.focus();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('preview:modelValue')).toContainEqual(['three']);
    third.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toContainEqual(['three']);

    await wrapper.get('.select-trigger').trigger('click');
    const first = document.body.querySelectorAll<HTMLElement>('.select-option')[0];
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).not.toContainEqual(['one']);
    expect(wrapper.emitted('preview:modelValue')).toContainEqual([null]);
    expect(wrapper.get('.select-trigger').attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('supports a two-line option slot and configurable option height', async () => {
    const wrapper = mount(Select, {
      attachTo: document.body,
      props: {
        modelValue: 'one',
        options: [
          { value: 'one', label: 'First option' },
          { value: 'two', label: 'Second option' },
        ],
        optionHeight: 58,
      },
      slots: {
        option: ({ option, previewing }) =>
          h('span', { class: 'two-line-option' }, [h('span', option.label), h('small', previewing ? 'Preview' : '')]),
      },
    });

    await wrapper.get('.select-trigger').trigger('click');
    const option = document.body.querySelector<HTMLElement>('[role="option"]')!;
    expect(option.style.height).toBe('58px');
    expect(option.querySelector('.two-line-option')).not.toBeNull();
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

  it('supports size variants sm, md, and lg', () => {
    const sm = mount(Select, { props: { modelValue: 'one', options, size: 'sm' } });
    expect(sm.get('.select-trigger').classes()).toContain('select-sm');

    const md = mount(Select, { props: { modelValue: 'one', options, size: 'md' } });
    expect(md.get('.select-trigger').classes()).toContain('select-md');

    const lg = mount(Select, { props: { modelValue: 'one', options, size: 'lg' } });
    expect(lg.get('.select-trigger').classes()).toContain('select-lg');
  });
});
