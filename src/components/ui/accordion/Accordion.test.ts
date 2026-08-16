import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Accordion from './Accordion.vue';

describe('Accordion', () => {
  it('defaults to a collapsed, accessible native button', () => {
    const wrapper = mount(Accordion, {
      props: { title: 'Appearance' },
      slots: { default: '<p class="accordion-body">Theme controls</p>' },
    });

    const trigger = wrapper.get('button');
    const contentId = trigger.attributes('aria-controls');

    expect(trigger.attributes('type')).toBe('button');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(trigger.text()).toContain('Appearance');
    expect(contentId).toBeTruthy();
    const content = wrapper.find(`#${contentId}`);
    expect(content.exists() ? content.isVisible() : false).toBe(false);
  });

  it('supports a title slot and reveals the default slot when opened', async () => {
    const wrapper = mount(Accordion, {
      slots: {
        title: '<span class="custom-title">Custom title</span>',
        default: '<p class="accordion-body">Theme controls</p>',
      },
    });

    expect(wrapper.find('.custom-title').text()).toBe('Custom title');
    const trigger = wrapper.get('button');
    const contentId = trigger.attributes('aria-controls');
    const content = wrapper.find(`#${contentId}`);
    expect(content.exists() ? content.isVisible() : false).toBe(false);

    await wrapper.setProps({ modelValue: true });

    expect(trigger.attributes('aria-expanded')).toBe('true');
    const openContent = wrapper.get(`#${contentId}`);
    expect(openContent.text()).toContain('Theme controls');
  });

  it('emits only model updates from the native button toggle', async () => {
    const wrapper = mount(Accordion, { props: { modelValue: false, title: 'Appearance' } });
    const trigger = wrapper.get('button');

    await trigger.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);

    await wrapper.setProps({ modelValue: true });
    await trigger.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[true], [false]]);
  });
});
