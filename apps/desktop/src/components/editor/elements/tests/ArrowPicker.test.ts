import { mount, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArrowPicker from '../ArrowPicker.vue';
import Input from '~/ui/input/Input.vue';
import { ARROW_CATALOG } from '@beam/engine/shared/arrow-catalog';
const close = vi.fn();
const stubs = {
  Popover: {
    name: 'Popover',
    props: ['disabled'],
    template: '<div><slot name="trigger" :isOpen="true"/><slot :close="close"/></div>',
    setup: () => ({ close }),
  },
  ScrollShadow: { template: '<div><slot/></div>' },
  Button: { props: ['disabled'], template: '<button :disabled="disabled"><slot name="icon"/><slot/></button>' },
};
enableAutoUnmount(afterEach);
describe('arrow library', () => {
  it('previews solid recipes with round joins and stroked arrows with clean terminal caps', () => {
    const solid = mount(ArrowPicker, { props: { modelValue: 'solid' }, global: { stubs } });
    const line = mount(ArrowPicker, { props: { modelValue: 'line' }, global: { stubs } });
    expect(solid.get('.trigger-preview path').attributes('stroke-linecap')).toBe('round');
    expect(line.get('.trigger-preview path').attributes('stroke-linecap')).toBe('butt');
    expect(solid.get('.trigger-preview path').attributes('fill')).toBe('currentColor');
  });
  it('previews all thirty presets and the selected recipe in the trigger', () => {
    const wrapper = mount(ArrowPicker, { props: { modelValue: 'curved' }, global: { stubs } });
    expect(wrapper.get('[role="listbox"]').attributes('aria-label')).toBe('Arrow library');
    expect(wrapper.findAll('[role="option"]')).toHaveLength(30);
    expect(wrapper.findAll('svg.preview')).toHaveLength(30);
    expect(wrapper.get('[aria-selected="true"]').attributes('aria-label')).toBe('Curved');
    expect(wrapper.find('svg.trigger-preview').exists()).toBe(true);
    expect(wrapper.get('.trigger-label > span').text()).toBe('Curved');
    expect(wrapper.get('.trigger-label > svg').attributes('aria-hidden')).toBe('true');
    expect(wrapper.text()).toContain('30 arrows');
  });
  it.each(ARROW_CATALOG)('selects $id and closes the library', async (definition) => {
    close.mockClear();
    const wrapper = mount(ArrowPicker, { global: { stubs } });
    await wrapper.findAll('[role="option"]')[ARROW_CATALOG.indexOf(definition)]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[definition.id]]);
    expect(close).toHaveBeenCalledOnce();
  });
  it('offers one clear arrow drawing action and closes with Escape', async () => {
    const wrapper = mount(ArrowPicker, { props: { allowDrawing: true }, global: { stubs } });
    close.mockClear();
    expect(wrapper.findAll('.drawing-actions button')).toHaveLength(1);
    await wrapper.get('.drawing-actions button').trigger('click');
    expect(wrapper.emitted('draw')).toEqual([[]]);
    await wrapper.get('.arrow-picker').trigger('keydown', { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(2);
    await wrapper.get('.arrow-picker').trigger('keydown', { key: 'ArrowDown' });
    expect(close).toHaveBeenCalledTimes(2);
    await wrapper.setProps({ allowDrawing: false });
    expect(wrapper.find('.drawing-actions').exists()).toBe(false);
  });
  it('searches names, shows an empty state and resets search on close', async () => {
    const wrapper = mount(ArrowPicker, { global: { stubs } });
    wrapper.getComponent(Input).vm.$emit('update:modelValue', 'S curve');
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('[role="option"]')[0]!.attributes('aria-label')).toBe('S curve');
    wrapper.getComponent(Input).vm.$emit('update:modelValue', 'zzzzzzqqqqq');
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.empty').text()).toBe('No arrows found');
    wrapper.getComponent({ name: 'Popover' }).vm.$emit('toggle', true);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('[role="option"]')).toHaveLength(0);
    wrapper.getComponent({ name: 'Popover' }).vm.$emit('toggle', false);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('[role="option"]')).toHaveLength(30);
  });
  it('retains disabled state on the picker trigger', () => {
    const wrapper = mount(ArrowPicker, { props: { disabled: true }, global: { stubs } });
    expect(wrapper.findAll('button')[0]!.attributes('disabled')).toBeDefined();
    expect(wrapper.get('.trigger-label > span').text()).toBe('Arrow');
  });
  it('marks an active arrow drawing tool independently of a selected preset', () => {
    const wrapper = mount(ArrowPicker, { props: { active: true }, global: { stubs } });
    expect(wrapper.findAll('button')[0]!.attributes('variant')).toBe('selected');
  });
});
