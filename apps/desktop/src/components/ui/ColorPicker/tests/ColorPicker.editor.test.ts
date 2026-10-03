import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import ColorPicker from '../ColorPicker.vue';
import ColorPickerCustom from '../ColorPickerCustom.vue';
import { setCurrentLocale, i18n } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
enableAutoUnmount(afterEach);
describe('compact color editing', () => {
  it('keeps the color swatch and editable hex without an automatic label', () => {
    const wrapper = mount(ColorPicker, { props: { modelValue: '#123456' } });
    expect(wrapper.find('.color-picker-label').exists()).toBe(false);
    expect(wrapper.get('button').attributes('aria-label')).toBe('Color');
    expect(wrapper.get('input').attributes('aria-label')).toBe('Color');
    expect(wrapper.find('.color-hex-field').exists()).toBe(true);
    expect(wrapper.find('.picker-top-bar').exists()).toBe(false);
  });
  it('retains explicit labels while keeping the popover header-free', async () => {
    const wrapper = mount(ColorPicker, { props: { label: 'Background', showLabel: true }, attachTo: document.body });
    expect(wrapper.get('.color-picker-label').text()).toBe('Background');
    wrapper.get('button').element.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
    await flushPromises();
    expect(document.querySelector('.picker-top-bar')).toBeNull();
    expect(wrapper.getComponent(ColorPickerCustom).props('hideHeader')).toBe(true);
  });
  it('commits a complete hex draft and rejects invalid notation without opening the popup', async () => {
    const wrapper = mount(ColorPicker, { props: { modelValue: '#123456' } });
    const field = wrapper.get('input');
    await field.setValue('abc');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await field.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update:modelValue')).toEqual([['#aabbcc']]);
    await field.setValue('not a color');
    await field.trigger('blur');
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('#123456');
    expect(wrapper.findComponent(ColorPickerCustom).exists()).toBe(false);
  });
  it('enters the popup on keyboard activation and restores swatch focus on Escape', async () => {
    const wrapper = mount(ColorPicker, { props: { modelValue: '#123456' }, attachTo: document.body });
    const swatch = wrapper.get<HTMLButtonElement>('button');
    swatch.element.focus();
    swatch.element.dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true }));
    await flushPromises();
    const picker = wrapper.getComponent(ColorPickerCustom);
    expect(document.activeElement).toBe(picker.get('input').element);
    await picker.get('input').trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect(wrapper.findComponent(ColorPickerCustom).exists()).toBe(false);
    expect(document.activeElement).toBe(swatch.element);
  });
  it('relays color, alpha and drag events in the popup and restores focus on picker dismissal', async () => {
    const wrapper = mount(ColorPicker, { attachTo: document.body, props: { showAlpha: true, alphaValue: 0.25 } });
    const swatch = wrapper.get('button');
    swatch.element.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
    await flushPromises();
    const picker = wrapper.getComponent(ColorPickerCustom);
    picker.vm.$emit('drag-start');
    picker.vm.$emit('update:modelValue', '#ABC');
    picker.vm.$emit('update:alpha', 2);
    picker.vm.$emit('update:alpha', NaN);
    picker.vm.$emit('drag-end');
    expect(wrapper.emitted('update:modelValue')).toEqual([['#aabbcc']]);
    expect(wrapper.emitted('update:alpha')).toEqual([[1]]);
    expect(wrapper.emitted('drag-start')).toEqual([[]]);
    expect(wrapper.emitted('drag-end')).toEqual([[]]);
    picker.vm.$emit('close');
    await flushPromises();
    expect(document.activeElement).toBe(swatch.element);
  });
  it('blocks both alpha and color edits when inline content is disabled', () => {
    const wrapper = mount(ColorPicker, { props: { inline: true, disabled: true } });
    const picker = wrapper.getComponent(ColorPickerCustom);
    picker.vm.$emit('update:modelValue', '#123456');
    picker.vm.$emit('update:alpha', 0.5);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('update:alpha')).toBeUndefined();
    expect(wrapper.attributes('inert')).toBeDefined();
    expect(picker.props('hideHeader')).toBe(true);
  });
  it('bounds inline alpha and permits opt-in standalone headings', () => {
    const wrapper = mount(ColorPicker, { props: { inline: true, hideHeader: false, showAlpha: true } });
    const picker = wrapper.getComponent(ColorPickerCustom);
    picker.vm.$emit('update:alpha', -1);
    picker.vm.$emit('update:alpha', 0.375);
    expect(wrapper.emitted('update:alpha')).toEqual([[0], [0.375]]);
    expect(picker.find('.picker-top-bar').exists()).toBe(true);
  });
  it.each(SUPPORTED_LOCALES)('uses localized accessible names without a visible label in %s', async (locale) => {
    await setCurrentLocale(locale);
    const wrapper = mount(ColorPicker);
    expect(wrapper.get('button').attributes('aria-label')).toBe(i18n.global.t('ColorPicker.color'));
    expect(wrapper.get('input').attributes('aria-label')).toBe(i18n.global.t('ColorPicker.color'));
    expect(wrapper.find('.color-picker-label').exists()).toBe(false);
  });
});
