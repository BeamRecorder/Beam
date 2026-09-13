import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  onPreferencesChanged: vi.fn(() => () => undefined),
}));
vi.mock('~/api/capture', () => ({ capture }));

import AppearanceSettings from './AppearanceSettings.vue';
import { useThemeStore } from '~/stores/theme';
import { COLOR_PRESETS, THEME_PRESETS } from '~/types/appearance';

describe('AppearanceSettings.vue', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    capture.getPreferences.mockResolvedValue({
      theme: 'light',
      appearance: {
        theme: 'light',
        primaryColor: '#ff5a1f',
        secondaryColor: '#6366f1',
        radiusPx: 10,
        isPillRadius: false,
        surfaceTone: 'default',
        activePresetId: 'beam-sunset',
      },
    });
    capture.updatePreferences.mockResolvedValue({});
    vi.clearAllMocks();
  });

  it('keeps Light, Dark, and System controls visible and clickable', async () => {
    const wrapper = mount(AppearanceSettings);
    await flushPromises();
    const store = useThemeStore();

    const modeButtons = wrapper.findAll('.theme-mode-group button');
    expect(modeButtons.map((button) => button.text())).toEqual(['Light', 'Dark', 'System']);
    await modeButtons[1].trigger('click');
    expect(store.theme).toBe('dark');
    await modeButtons[2].trigger('click');
    expect(store.theme).toBe('system');
  });

  it('applies a global UI scale and allows each region to follow global or override it', async () => {
    const wrapper = mount(AppearanceSettings);
    await flushPromises();
    const store = useThemeStore();

    const advancedTrigger = wrapper.get('.advanced-toggle');
    expect(advancedTrigger.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.appearance-advanced-panel').exists()).toBe(false);
    await advancedTrigger.trigger('click');
    expect(advancedTrigger.attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('.appearance-advanced-panel').exists()).toBe(true);

    const globalSlider = wrapper.get('.ui-scale-slider input[type="range"]');
    expect(wrapper.get('.ui-scale-slider.slider-wrapper').classes()).toContain('size-default');
    expect(wrapper.get('.ui-scale-slider.slider-wrapper').classes()).not.toContain('size-compact');
    const inputOnly = async (value: number) => {
      (globalSlider.element as HTMLInputElement).value = String(value);
      await globalSlider.trigger('input');
    };
    expect(globalSlider.attributes()).toMatchObject({ min: '50', max: '125', step: '25', value: '100' });
    await inputOnly(83);
    expect(store.uiScaleGlobal).toBe(100);
    await globalSlider.trigger('change');
    expect(store.uiScaleGlobal).toBe(100);
    await inputOnly(75);
    expect(store.uiScaleGlobal).toBe(100);
    await globalSlider.trigger('change');
    expect(store.uiScaleGlobal).toBe(75);
    await inputOnly(50);
    await globalSlider.trigger('change');
    expect(store.uiScaleGlobal).toBe(50);
    await inputOnly(125);
    await globalSlider.trigger('change');
    expect(store.uiScaleGlobal).toBe(125);
    expect(store.resolvedUiScale('topbar')).toBe(125);

    expect(wrapper.findAll('.scale-override-row')).toHaveLength(5);

    const topbarRow = wrapper.get('.scale-override-row:first-child');
    expect(topbarRow.get('.scale-override-slider.slider-wrapper').classes()).toContain('size-compact');
    expect(topbarRow.get('.scale-override-slider.slider-wrapper').classes()).not.toContain('size-default');
    const topbarSlider = topbarRow.get('.scale-override-slider input[type="range"]');
    const useGlobal = topbarRow.get('.scale-override-heading button');
    expect(topbarSlider.attributes()).toMatchObject({ min: '50', max: '125', step: '25', disabled: '' });
    expect(useGlobal.attributes('aria-pressed')).toBe('true');

    await useGlobal.trigger('click');
    expect(store.uiScaleOverrides.topbar).toBe(125);
    expect(topbarSlider.attributes('disabled')).toBeUndefined();
    (topbarSlider.element as HTMLInputElement).value = '83';
    await topbarSlider.trigger('input');
    expect(store.uiScaleOverrides.topbar).toBe(125);
    await topbarSlider.trigger('change');
    expect(store.uiScaleOverrides.topbar).toBe(125);
    expect(store.resolvedUiScale('topbar')).toBe(125);

    await useGlobal.trigger('click');
    expect(store.uiScaleOverrides.topbar).toBeNull();
    expect(store.resolvedUiScale('topbar')).toBe(125);
    expect(topbarSlider.attributes('disabled')).toBeDefined();
  });

  it('debounces persistence while the preset scale slider is adjusted', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mount(AppearanceSettings);
      await flushPromises();
      const store = useThemeStore();
      await wrapper.get('.advanced-toggle').trigger('click');
      capture.updatePreferences.mockClear();
      const slider = wrapper.get('.ui-scale-slider input[type="range"]');
      const inputOnly = async (value: number) => {
        (slider.element as HTMLInputElement).value = String(value);
        await slider.trigger('input');
      };
      await inputOnly(50);
      await inputOnly(75);
      expect(store.uiScaleGlobal).toBe(100);
      expect(capture.updatePreferences).not.toHaveBeenCalled();
      await slider.trigger('change');
      expect(store.uiScaleGlobal).toBe(75);
      await vi.runOnlyPendingTimersAsync();
      expect(capture.updatePreferences).toHaveBeenCalled();
      expect(capture.updatePreferences.mock.calls.at(-1)?.[0]).toMatchObject({
        appearance: { uiScale: { global: 75 } },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps Advanced closed and opens scaling and theme customization categories together', async () => {
    const wrapper = mount(AppearanceSettings);
    await flushPromises();

    const trigger = wrapper.get('.advanced-toggle');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.appearance-advanced-panel').exists()).toBe(false);

    await trigger.trigger('click');
    expect(trigger.attributes('aria-expanded')).toBe('true');
    wrapper.get('.appearance-advanced-panel .advanced-category.ui-scale-setting');
    wrapper.get('.appearance-advanced-panel .theme-customization-section');
    expect(wrapper.findAll('.appearance-advanced-panel .advanced-category')).toHaveLength(2);
    expect(wrapper.find('.appearance-advanced-panel .accordion').exists()).toBe(false);
  });

  it('hides the UI scaling section when explicitly disabled', async () => {
    const wrapper = mount(AppearanceSettings, { props: { showUiScaling: false } });
    await flushPromises();

    await wrapper.get('.advanced-toggle').trigger('click');

    expect(wrapper.find('.ui-scale-setting').exists()).toBe(false);
    expect(wrapper.find('.ui-scale-slider').exists()).toBe(false);
    expect(wrapper.find('.theme-customization-section').exists()).toBe(true);
  });

  it('keeps the UI scaling section enabled by default for editor settings', async () => {
    const wrapper = mount(AppearanceSettings);
    await flushPromises();

    await wrapper.get('.advanced-toggle').trigger('click');

    expect(wrapper.find('.ui-scale-setting').exists()).toBe(true);
    expect(wrapper.find('.ui-scale-slider').exists()).toBe(true);
  });

  it('aligns one color picker with each primary and secondary color section', async () => {
    const wrapper = mount(AppearanceSettings);
    await flushPromises();
    await wrapper.get('.advanced-toggle').trigger('click');

    expect(wrapper.find('.primary-color-section .custom-picker-wrap .color-picker-wrapper').exists()).toBe(true);
    expect(wrapper.find('.secondary-color-section .custom-picker-wrap .color-picker-wrapper').exists()).toBe(true);
  });

  it('renders theme presets and applies a preset on click', async () => {
    const wrapper = mount(AppearanceSettings);
    await flushPromises();
    const store = useThemeStore();
    await wrapper.get('.advanced-toggle').trigger('click');

    const presetCards = wrapper.findAll('.preset-card');
    expect(presetCards.length).toBeGreaterThan(3);

    // Click Cyber Violet preset
    const cyberPreset = THEME_PRESETS.find((p) => p.id === 'cyber-violet')!;
    const cyberButton = presetCards.find((card) => card.text().includes(cyberPreset.name));
    expect(cyberButton).toBeDefined();

    await cyberButton!.trigger('click');
    expect(store.activePresetId).toBe('cyber-violet');
    expect(store.primaryColor).toBe(cyberPreset.primaryColor);
    expect(store.secondaryColor).toBe(cyberPreset.secondaryColor);
    expect(store.surfaceTone).toBe('slate');
  });

  it('selects color swatches for primary and secondary colors', async () => {
    const wrapper = mount(AppearanceSettings);
    await flushPromises();
    const store = useThemeStore();
    await wrapper.get('.advanced-toggle').trigger('click');

    const swatchButtons = wrapper.findAll('.swatch-btn');
    expect(swatchButtons.length).toBeGreaterThan(5);

    // Select second swatch
    await swatchButtons[1].trigger('click');
    expect(store.primaryColor).toBe(COLOR_PRESETS[1].color);
  });

  it('shows a slider for the custom corner radius option', async () => {
    const wrapper = mount(AppearanceSettings);
    await flushPromises();
    const store = useThemeStore();
    await wrapper.get('.advanced-toggle').trigger('click');

    const radiusButtons = wrapper.findAll('.radius-presets-group button');
    expect(radiusButtons).toHaveLength(6);
    expect(wrapper.find('.radius-slider-wrap').exists()).toBe(false);
    const customButton = radiusButtons.at(-1)!;
    expect(customButton.classes()).toContain('btn-icon-only');
    expect(customButton.attributes('aria-label')).toBe('Custom');
    expect(customButton.find('.lucide-sliders-horizontal').exists()).toBe(true);
    expect(radiusButtons[2]!.classes()).toContain('btn-primary');
    expect(
      radiusButtons.filter((_, index) => index !== 2).every((button) => button.classes().includes('btn-ghost')),
    ).toBe(true);

    // Sharp (0px)
    await radiusButtons[0].trigger('click');
    expect(store.radiusPx).toBe(0);
    expect(store.isPillRadius).toBe(false);

    const customRadiusButton = customButton;
    expect(customRadiusButton).toBeDefined();

    await customRadiusButton!.trigger('click');
    expect(store.isPillRadius).toBe(false);
    expect(wrapper.find('.radius-slider-wrap').exists()).toBe(true);

    const slider = wrapper.get('.radius-slider-wrap input[type="range"]');
    expect(slider.attributes()).toMatchObject({ min: '0', max: '32', step: '1' });
    await slider.setValue('18');
    expect(store.radiusPx).toBe(18);
  });

  it('renders the full-width surface tone select and updates the store', async () => {
    const wrapper = mount(AppearanceSettings);
    await flushPromises();
    const store = useThemeStore();
    await wrapper.get('.advanced-toggle').trigger('click');

    const select = wrapper.get('.surface-tone-select');
    expect(select.get('.select-trigger').text()).toContain('Warm Sand');
    await select.get('.select-trigger').trigger('click');
    const options = document.body.querySelectorAll<HTMLElement>('.select-option');
    expect(options).toHaveLength(4);
    const neutral = Array.from(options).find((option) => option.textContent?.includes('Neutral'));
    expect(neutral).toBeDefined();
    await neutral!.click();
    expect(store.surfaceTone).toBe('neutral');
  });

  it('resets to default when reset button is clicked', async () => {
    const wrapper = mount(AppearanceSettings, { props: { showTitle: false } });
    await flushPromises();
    const store = useThemeStore();

    store.setPrimaryColor('#000000');
    store.setRadius(2);

    await wrapper.get('.advanced-toggle').trigger('click');
    const resetBtn = wrapper.get('.appearance-reset-button');
    const resetActions = wrapper.get('.customization-actions');
    expect(wrapper.get('.theme-customization-section').classes()).toContain('theme-customization-section');
    expect(wrapper.get('.appearance-advanced-panel').classes()).toContain('appearance-advanced-panel');
    expect(resetActions.find('.tooltip-wrapper').exists()).toBe(false);
    resetActions.get(':scope > .btn-container.btn-block');
    expect(resetBtn.classes()).toEqual(expect.arrayContaining(['btn-ghost', 'btn-xs', 'btn-block']));
    await resetBtn.trigger('click');

    expect(store.primaryColor).toBe('#ff5a1f');
    expect(store.radiusPx).toBe(10);
    expect(store.surfaceTone).toBe('default');
  });
});
