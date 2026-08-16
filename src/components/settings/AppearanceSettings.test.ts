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
import { COLOR_PRESETS, RADIUS_PRESETS, THEME_PRESETS } from '~/types/appearance';

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

  it('renders the theme mode select and switches theme', async () => {
    const wrapper = mount(AppearanceSettings);
    await flushPromises();
    const store = useThemeStore();

    const modeSelect = wrapper.get('.theme-mode-select .select-trigger');
    await modeSelect.trigger('click');

    const modeOptions = document.body.querySelectorAll<HTMLElement>('.select-option');
    expect(modeOptions).toHaveLength(3);

    await modeOptions[1].click(); // Dark
    expect(store.theme).toBe('dark');

    await modeSelect.trigger('click');
    const reopenedModeOptions = document.body.querySelectorAll<HTMLElement>('.select-option');
    await reopenedModeOptions[2].click(); // System
    expect(store.theme).toBe('system');
  });

  it('renders theme presets and applies a preset on click', async () => {
    const wrapper = mount(AppearanceSettings);
    await flushPromises();
    const store = useThemeStore();

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

    const radiusButtons = wrapper.findAll('.radius-presets-group button');
    expect(radiusButtons).toHaveLength(6);
    expect(wrapper.find('.radius-slider-wrap').exists()).toBe(false);

    // Sharp (0px)
    await radiusButtons[0].trigger('click');
    expect(store.radiusPx).toBe(0);
    expect(store.isPillRadius).toBe(false);

    const customRadius = RADIUS_PRESETS.find((preset) => preset.isCustom)!;
    const customRadiusButton = radiusButtons.find((button) => button.text() === customRadius.label);
    expect(customRadiusButton).toBeDefined();

    await customRadiusButton!.trigger('click');
    expect(store.isPillRadius).toBe(false);
    expect(wrapper.find('.radius-slider-wrap').exists()).toBe(true);

    const slider = wrapper.get('.radius-slider-wrap input[type="range"]');
    expect(slider.attributes()).toMatchObject({ min: '0', max: '32', step: '1' });
    await slider.setValue('18');
    expect(store.radiusPx).toBe(18);
  });

  it('resets to default when reset button is clicked', async () => {
    const wrapper = mount(AppearanceSettings, { props: { showTitle: true } });
    await flushPromises();
    const store = useThemeStore();

    store.setPrimaryColor('#000000');
    store.setRadius(2);

    const resetBtn = wrapper.find('.appearance-header button');
    await resetBtn.trigger('click');

    expect(store.primaryColor).toBe('#ff5a1f');
    expect(store.radiusPx).toBe(10);
    expect(store.surfaceTone).toBe('default');
  });
});
