import { afterEach, it, expect, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createArtisticEffect } from '@beam/engine';
import ScreenshotArtisticPanel from './ScreenshotArtisticPanel.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import ScreenshotOpacity from '../composition/ScreenshotOpacity.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
enableAutoUnmount(afterEach);
it.each(['ascii', 'grain', 'cyanotype'] as const)(
  'edits %s in isolation and forwards lifecycle actions',
  async (kind) => {
    const effect = createArtisticEffect(kind, 'x'),
      wrapper = mount(ScreenshotArtisticPanel, { props: { effect } });
    const slider = wrapper.findComponent(BigSlider);
    slider.vm.$emit('update:modelValue', 10000);
    expect(wrapper.emitted('update')).toHaveLength(1);
    expect(wrapper.props('effect')).toEqual(effect);
    await wrapper.get('[aria-label="remove"]').trigger('click');
    await wrapper.get('[aria-label="back"]').trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'reset')!
      .trigger('click');
    expect(wrapper.emitted('remove')).toEqual([[]]);
    expect(wrapper.emitted('back')).toEqual([[]]);
    expect(wrapper.emitted('update')?.at(-1)).toEqual([{ recipe: effect.recipe }]);
  },
);
it('guards invalid, disabled and stale field changes', () => {
  const wrapper = mount(ScreenshotArtisticPanel, { props: { effect: createArtisticEffect('ascii', 'x') } });
  wrapper.findComponent(BigSlider).vm.$emit('update:modelValue', NaN);
  wrapper.findComponent(ColorPicker).vm.$emit('update:modelValue', 'invalid');
  expect(wrapper.emitted('update')).toBeUndefined();
  const disabled = mount(ScreenshotArtisticPanel, {
    props: { effect: createArtisticEffect('grain', 'x'), disabled: true },
  });
  disabled.findComponent(BigSlider).vm.$emit('update:modelValue', 15);
  disabled.findAllComponents(Switch)[1]!.vm.$emit('update:modelValue', false);
  expect(disabled.emitted('update')).toBeUndefined();
});
it('publishes complete color, switch and numeric recipes without mutating the source', () => {
  const effect = createArtisticEffect('ascii', 'x');
  effect.recipe.colored = false;
  const wrapper = mount(ScreenshotArtisticPanel, { props: { effect } });
  wrapper.findComponent(ColorPicker).vm.$emit('update:modelValue', '#abcdef');
  wrapper.findAllComponents(Switch)[1]!.vm.$emit('update:modelValue', false);
  expect(wrapper.emitted('update')?.[0]).toEqual([{ recipe: { ...effect.recipe, foreground: '#abcdef' } }]);
  expect(wrapper.emitted('update')?.[1]).toEqual([{ recipe: { ...effect.recipe, colored: false } }]);
});

it('routes effect enable and opacity through the shared controls', () => {
  const wrapper = mount(ScreenshotArtisticPanel, { props: { effect: createArtisticEffect('grain', 'x') } });
  wrapper.findComponent(Switch).vm.$emit('update:modelValue', false);
  wrapper.findComponent(ScreenshotOpacity).vm.$emit('update:modelValue', 25);
  expect(wrapper.emitted('update')).toEqual([[{ enabled: false }], [{ opacity: 25 }]]);
});
