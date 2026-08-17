import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Checkbox from './Checkbox.vue';

describe('Checkbox', () => {
  it('exposes checked state and label accessibly', () => {
    const wrapper = mount(Checkbox, { props: { modelValue: true, label: 'Select project' } });
    expect(wrapper.get('[role=checkbox]').attributes('aria-checked')).toBe('true');
    expect(wrapper.text()).toContain('Select project');
  });

  it('supports indeterminate state', () => {
    const wrapper = mount(Checkbox, { props: { modelValue: false, indeterminate: true, ariaLabel: 'Select all' } });
    expect(wrapper.get('[role=checkbox]').attributes('aria-checked')).toBe('mixed');
    expect(wrapper.find('.checkbox-minus').exists()).toBe(true);
  });

  it('supports an accessible name without rendering a visible label', () => {
    const wrapper = mount(Checkbox, { props: { modelValue: false, ariaLabel: 'Select project 1' } });
    expect(wrapper.get('[role=checkbox]').attributes('aria-label')).toBe('Select project 1');
    expect(wrapper.text()).toBe('');
  });

  it('toggles value when clicked', async () => {
    const wrapper = mount(Checkbox, { props: { modelValue: false } });
    await wrapper.get('.checkbox-container').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
    expect(wrapper.emitted('change')).toEqual([[true]]);
  });

  it('toggles value on keyboard Space and Enter', async () => {
    const wrapper = mount(Checkbox, { props: { modelValue: false } });
    await wrapper.get('[role=checkbox]').trigger('keydown', { key: ' ' });
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);

    await wrapper.get('[role=checkbox]').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update:modelValue')).toEqual([[true], [true]]);
  });

  it('does not toggle when disabled', async () => {
    const wrapper = mount(Checkbox, { props: { modelValue: false, disabled: true } });
    await wrapper.get('.checkbox-container').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
