import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import Accordion from './Accordion.vue';
import { defineComponent, h, ref } from 'vue';
enableAutoUnmount(afterEach);

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
    const wrapper = mount(Accordion, {
      props: { modelValue: false, title: 'Appearance' },
    });
    const trigger = wrapper.get('button');

    await trigger.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);

    await wrapper.setProps({ modelValue: true });
    await trigger.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[true], [false]]);
  });
  it('keeps collapsed controls inert and retains their state across reopening', async () => {
    const DraftField = defineComponent({
      setup() {
        return { draft: ref('draft') };
      },
      template: '<input v-model="draft">',
    });
    const wrapper = mount(Accordion, {
      props: { modelValue: true, appearance: 'inspector', bordered: false },
      slots: { default: () => h(DraftField) },
    });
    const field = wrapper.get('input');
    await field.setValue('retained');
    await wrapper.setProps({ modelValue: false });
    expect(wrapper.get('.accordion-content').attributes('inert')).toBeDefined();
    expect(wrapper.get('input').element.value).toBe('retained');
    await wrapper.setProps({ modelValue: true });
    expect(wrapper.get('.accordion-content').attributes('inert')).toBeUndefined();
    expect(wrapper.get('input').element.value).toBe('retained');
    expect(wrapper.classes()).toContain('accordion-inspector');
    expect(wrapper.classes()).toContain('is-borderless');
  });
  it('keeps header actions outside the disclosure button', async () => {
    const wrapper = mount(Accordion, { slots: { actions: '<button class="reset">Reset</button>' } });
    expect(wrapper.get('.accordion-trigger').find('.reset').exists()).toBe(false);
    await wrapper.get('.reset').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
  it('ignores toggles while disabled', async () => {
    const wrapper = mount(Accordion, { props: { disabled: true, title: 'Unavailable' } });
    await wrapper.get('.accordion-trigger').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.classes()).toContain('is-disabled');
  });
});
