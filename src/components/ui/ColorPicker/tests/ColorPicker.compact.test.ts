import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, setCurrentLocale } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
import ColorPicker from '../ColorPicker.vue';
import ColorPickerCustom from '../ColorPickerCustom.vue';

enableAutoUnmount(afterEach);
const pickScreenColor = vi.fn();

beforeEach(() => {
  pickScreenColor.mockResolvedValue({ sRGBHex: '#fedcba' });
  Object.defineProperty(window, 'EyeDropper', {
    configurable: true,
    value: class {
      open = pickScreenColor;
    },
  });
});

afterEach(() => {
  delete (window as Window & { EyeDropper?: unknown }).EyeDropper;
  vi.clearAllMocks();
});

describe('compact color picker', () => {
  it('keeps the hex field, format toggle and eyedropper together without a repeated preview or caption', () => {
    const wrapper = mount(ColorPickerCustom, {
      props: { type: 'standard', modelValue: '#123456', hideHeader: true },
    });
    expect(wrapper.find('.picker-top-bar').exists()).toBe(false);
    expect(wrapper.find('.color-preview-large').exists()).toBe(false);
    expect(wrapper.find('.previews-row').exists()).toBe(false);
    expect(wrapper.find('.channel-label').exists()).toBe(false);
    const row = wrapper.get('.inputs-row');
    expect(row.get<HTMLInputElement>('input[aria-label="HEX"]').element.value).toBe('#123456');
    expect(row.find('.mode-switch-btn svg.btn-icon').exists()).toBe(true);
    expect(row.find('.eyedropper-btn svg.btn-icon').exists()).toBe(true);
    expect(row.get('.mode-switch-btn').attributes('title')).toBe('Color format');
    expect(row.get('.eyedropper-btn').attributes('title')).toBe('Pick screen color');
  });

  it('switches between named RGB channels and hex without emitting a color change', async () => {
    const wrapper = mount(ColorPickerCustom, { props: { type: 'standard', modelValue: '#123456' } });
    await wrapper.get('.mode-switch-btn').trigger('click');
    expect(wrapper.findAll('input').map((input) => input.attributes('aria-label'))).toEqual(['R', 'G', 'B']);
    expect(wrapper.findAll('input').map((input) => input.element.value)).toEqual(['18', '52', '86']);
    await wrapper.get('.mode-switch-btn').trigger('click');
    expect(wrapper.get<HTMLInputElement>('input[aria-label="HEX"]').element.value).toBe('#123456');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('keeps the format icon visible when the eyedropper is unavailable', () => {
    delete (window as Window & { EyeDropper?: unknown }).EyeDropper;
    const wrapper = mount(ColorPickerCustom, { props: { type: 'standard', modelValue: '#123456' } });
    expect(wrapper.find('.eyedropper-btn').exists()).toBe(false);
    expect(wrapper.find('.mode-switch-btn svg.btn-icon').exists()).toBe(true);
    expect(wrapper.find('input[aria-label="HEX"]').exists()).toBe(true);
  });

  it('retains custom accessible names and a visible close icon for standalone pickers', async () => {
    const wrapper = mount(ColorPickerCustom, {
      props: {
        type: 'standard',
        modelValue: '#123456',
        label: 'Background',
        eyedropperLabel: 'Sample background',
        formatLabel: 'Change notation',
      },
    });
    expect(wrapper.get('.picker-top-title').text()).toBe('Background');
    expect(wrapper.get('.eyedropper-btn').attributes('aria-label')).toBe('Sample background');
    expect(wrapper.get('.mode-switch-btn').attributes('aria-label')).toBe('Change notation');
    expect(wrapper.find('[aria-label="Close"] svg.btn-icon').exists()).toBe(true);
    await wrapper.get('[aria-label="Close"]').trigger('click');
    expect(wrapper.emitted('close')).toEqual([[]]);
    await wrapper.setProps({ eyedropperLabel: undefined, formatLabel: undefined });
    expect(wrapper.get('.eyedropper-btn').attributes('aria-label')).toBe('Pick screen color');
    expect(wrapper.get('.mode-switch-btn').attributes('aria-label')).toBe('Color format');
  });

  it('keeps an actual popover header-free while editing hex/RGB and sampling a color, then closes on Escape', async () => {
    const wrapper = mount(ColorPicker, {
      attachTo: document.body,
      props: { modelValue: '#123456', eyedropperLabel: 'Sample', formatLabel: 'Notation' },
    });
    await wrapper.get('.popover-trigger').trigger('click');
    await flushPromises();
    const picker = wrapper.getComponent(ColorPickerCustom);
    expect(picker.find('.picker-top-bar').exists()).toBe(false);
    expect(picker.find('.color-preview-large').exists()).toBe(false);
    await picker.get('input[aria-label="HEX"]').setValue('#abcdef');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['#abcdef']);
    await wrapper.setProps({ modelValue: '#abcdef' });
    await picker.get('[aria-label="Notation"]').trigger('click');
    await picker.get('input[aria-label="R"]').setValue('255');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['#ffcdef']);
    await picker.get('[aria-label="Sample"]').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['#fedcba']);
    expect(document.querySelector('.popover-picker-content')).not.toBeNull();
    await picker.get('input[aria-label="R"]').trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect(document.querySelector('.popover-picker-content')).toBeNull();
    await wrapper.get('.popover-trigger').trigger('click');
    await flushPromises();
    expect(document.querySelector('.popover-picker-content .picker-top-bar')).toBeNull();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(document.querySelector('.popover-picker-content')).toBeNull();
  });

  it.each(SUPPORTED_LOCALES)('names color controls in %s without untranslated keys', async (locale) => {
    await setCurrentLocale(locale);
    const wrapper = mount(ColorPickerCustom, { props: { type: 'standard', modelValue: '#123456' } });
    for (const key of ['color', 'close', 'eyedropper', 'colorFormat']) {
      expect(i18n.global.te(`ColorPicker.${key}`, locale)).toBe(true);
      expect(i18n.global.t(`ColorPicker.${key}`)).not.toBe(`ColorPicker.${key}`);
    }
    expect(wrapper.get('.picker-top-title').text()).toBe(i18n.global.t('ColorPicker.color'));
    expect(wrapper.get('.mode-switch-btn').attributes('aria-label')).toBe(i18n.global.t('ColorPicker.colorFormat'));
    expect(wrapper.get('.eyedropper-btn').attributes('aria-label')).toBe(i18n.global.t('ColorPicker.eyedropper'));
  });
});
