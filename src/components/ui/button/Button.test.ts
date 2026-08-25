import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Button from './Button.vue';

describe('Button', () => {
  it('renders its semantic type, content and visual variants', () => {
    const wrapper = mount(Button, {
      props: { type: 'submit', variant: 'danger', size: 'lg', block: true },
      slots: { default: 'Delete' },
    });
    expect(wrapper.get('button').attributes('type')).toBe('submit');
    expect(wrapper.text()).toContain('Delete');
    expect(wrapper.classes()).toContain('btn-block');
    expect(wrapper.get('button').classes()).toContain('btn-block');
    expect(wrapper.get('button').classes()).toContain('btn-danger');
  });
  it('emits clicks when it is enabled', async () => {
    const wrapper = mount(Button, { slots: { default: 'Export' } });
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });
  it('renders the same button primitive as a link when href is provided', () => {
    const wrapper = mount(Button, {
      props: { href: '/install', size: 'lg' },
      slots: { icon: '<span class="platform-icon" />', default: 'Install Beam' },
    });
    const link = wrapper.get('a');

    expect(link.attributes('href')).toBe('/install');
    expect(link.classes()).toContain('btn-primary');
    expect(link.classes()).toContain('btn-lg');
    expect(link.find('.platform-icon').exists()).toBe(true);
    expect(wrapper.find('button').exists()).toBe(false);
  });
  it('does not emit clicks while disabled or loading', async () => {
    for (const props of [{ disabled: true }, { loading: true }]) {
      const wrapper = mount(Button, { props: props as never });
      await wrapper.get('button').trigger('click');
      expect(wrapper.emitted('click')).toBeUndefined();
      expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    }
  });

  it('keeps the tooltip wrapper mounted while tooltipDisabled fades the content out', async () => {
    const wrapper = mount(Button, {
      attachTo: document.body,
      props: { tooltip: 'Preview quality', tooltipDelay: 0, tooltipDisabled: true },
      slots: { default: 'Quality' },
    });
    const tooltipWrapper = wrapper.get('.tooltip-wrapper');

    await tooltipWrapper.trigger('mouseenter');
    expect(document.body.querySelector('.tooltip-content')).toBeNull();

    await wrapper.setProps({ tooltipDisabled: false });
    await tooltipWrapper.trigger('mouseenter');
    await nextTick();
    expect(document.body.querySelector('.tooltip-content')?.textContent).toContain('Preview quality');

    await wrapper.setProps({ tooltipDisabled: true });
    await nextTick();
    expect(wrapper.find('.tooltip-wrapper').exists()).toBe(true);
    expect(document.body.querySelector('.tooltip-content')).toBeNull();

    await wrapper.setProps({ tooltipDisabled: false });
    await wrapper.get('.tooltip-wrapper').trigger('mouseenter');
    await nextTick();
    expect(document.body.querySelector('.tooltip-content')?.textContent).toContain('Preview quality');
    wrapper.unmount();
  });
});
