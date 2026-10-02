import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ColorFillPresetControls from './ColorFillPresetControls.vue';
import AddTileButton from '~/ui/button/AddTileButton.vue';
import Tooltip from '~/ui/tooltip/Tooltip.vue';
import { BACKGROUND_COLORS, BACKGROUND_GRADIENTS } from '../composables/backgroundCatalog';
import { i18n, setCurrentLocale } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';

const capture = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  onPreferencesChanged: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));
let wrapper: VueWrapper;

beforeEach(() => {
  capture.getPreferences.mockResolvedValue({
    backgroundPresets: { colors: [], gradients: [] },
    extras: {},
  });
  capture.onPreferencesChanged.mockReturnValue(vi.fn());
});
afterEach(() => wrapper?.unmount());

it.each(SUPPORTED_LOCALES)('uses translated shared tooltips for color and gradient additions in %s', async (locale) => {
  await setCurrentLocale(locale);
  wrapper = mount(ColorFillPresetControls, {
    props: { modelValue: { kind: 'color', color: '#ffffff' } },
  });
  await flushPromises();
  for (const [key, expectedPresetCount] of [
    ['customColor', BACKGROUND_COLORS.length],
    ['customGradient', BACKGROUND_GRADIENTS.length],
  ] as const) {
    const tooltip = wrapper.getComponent(Tooltip);
    expect(tooltip.props('content')).toBe(i18n.global.t(`CanvasPanel.${key}`));
    expect(tooltip.getComponent(AddTileButton).props('label')).toBe(tooltip.props('content'));
    expect(wrapper.get('.preset-grid').findAll('.preset-tile')).toHaveLength(expectedPresetCount);
    expect(wrapper.get('.preset-add-tooltip').classes()).toContain('tooltip-wrapper');
    expect(wrapper.get('.preset-add-tooltip').attributes('style')).toContain('width: 100%');
    expect(wrapper.get('.preset-add-tooltip').attributes('style')).toContain('display: flex');
    await wrapper.get('.preset-add-tooltip').trigger('mouseenter');
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain(tooltip.props('content'));
    await wrapper.get('.preset-add-tooltip').trigger('mouseleave');
    if (key === 'customColor') await wrapper.findAll('.kind-group button')[1]!.trigger('click');
  }
});

it.each(['color', 'gradient'] as const)(
  'preserves selection and neutral active state for %s swatches',
  async (kind) => {
    const modelValue =
      kind === 'color'
        ? { kind, color: BACKGROUND_COLORS[0]!.color }
        : { kind, gradient: BACKGROUND_GRADIENTS[0]!.gradient };
    wrapper = mount(ColorFillPresetControls, { props: { modelValue } });
    await flushPromises();
    expect(wrapper.get('.preset-tile').classes()).toContain('active');
    expect(wrapper.get('.preset-tile').attributes('style')).toContain(
      kind === 'gradient' ? 'background-image:' : 'background-color:',
    );
    expect(wrapper.get('.preset-tile').attributes('style')).not.toMatch(/(?:^|;)\s*background:/);
    await wrapper.findAll('.preset-tile')[1]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toMatchObject({
      kind,
    });
  },
);

it.each([
  { type: 'linear' as const, alpha: 1 },
  { type: 'radial' as const, alpha: 1 },
  { type: 'radial' as const, alpha: 0.35 },
])('preserves saved $type gradients with alpha $alpha as background images', async ({ type, alpha }) => {
  const gradient = {
    ...BACKGROUND_GRADIENTS[0]!.gradient,
    type,
    stops: BACKGROUND_GRADIENTS[0]!.gradient.stops.map((stop) => ({
      ...stop,
      alpha,
    })),
  };
  capture.getPreferences.mockResolvedValue({
    backgroundPresets: { colors: [], gradients: [gradient] },
    extras: {},
  });
  wrapper = mount(ColorFillPresetControls, {
    props: { modelValue: { kind: 'gradient', gradient } },
  });
  await flushPromises();
  const tile = wrapper.findAll('.preset-tile').at(-1)!;
  expect(tile.attributes('style')).toContain(`background-image: ${type}-gradient(`);
  expect(tile.attributes('style')).not.toMatch(/(?:^|;)\s*background:/);
  await tile.trigger('click');
  expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual({
    kind: 'gradient',
    gradient,
  });
});
