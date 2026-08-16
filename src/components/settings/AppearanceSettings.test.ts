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

  it('keeps customization collapsed until opened and groups advanced settings', async () => {
    const wrapper = mount(AppearanceSettings);
    await flushPromises();

    const trigger = wrapper.get('.customization-trigger');
    const header = wrapper.get('.customization-header');
    expect(header.findAll('.customization-trigger')).toHaveLength(1);
    expect(trigger.get('.customization-chevron').element).toBe(trigger.element.lastElementChild);
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.customization-panel').exists()).toBe(false);

    await trigger.trigger('click');
    expect(trigger.attributes('aria-expanded')).toBe('true');
    wrapper.get('.customization-panel .preset-card');
    wrapper.get('.customization-panel .primary-color-section');
    wrapper.get('.customization-panel .secondary-color-section');
    wrapper.get('.customization-panel .radius-presets-group');
    wrapper.get('.customization-panel .surface-tone-select');
  });

  it('aligns one color picker with each primary and secondary color section', async () => {
    const wrapper = mount(AppearanceSettings);
    await flushPromises();
    await wrapper.get('.customization-trigger').trigger('click');

    expect(wrapper.find('.primary-color-section .custom-picker-wrap .color-picker-wrapper').exists()).toBe(true);
    expect(wrapper.find('.secondary-color-section .custom-picker-wrap .color-picker-wrapper').exists()).toBe(true);
  });

  it('renders theme presets and applies a preset on click', async () => {
    const wrapper = mount(AppearanceSettings);
    await flushPromises();
    const store = useThemeStore();
    await wrapper.get('.customization-trigger').trigger('click');

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
    await wrapper.get('.customization-trigger').trigger('click');

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
    await wrapper.get('.customization-trigger').trigger('click');

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
    await wrapper.get('.customization-trigger').trigger('click');

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

    await wrapper.get('.customization-trigger').trigger('click');
    const resetBtn = wrapper.get('.appearance-reset-button');
    const resetActions = wrapper.get('.customization-actions');
    expect(wrapper.get('.customization-header').classes()).toContain('customization-header');
    expect(wrapper.get('.customization-panel').classes()).toContain('customization-panel');
    expect(resetActions.find('.tooltip-wrapper').exists()).toBe(false);
    resetActions.get(':scope > .btn-container.btn-block');
    expect(resetBtn.classes()).toEqual(expect.arrayContaining(['btn-ghost', 'btn-xs', 'btn-block']));
    await resetBtn.trigger('click');

    expect(store.primaryColor).toBe('#ff5a1f');
    expect(store.radiusPx).toBe(10);
    expect(store.surfaceTone).toBe('default');
  });
});
