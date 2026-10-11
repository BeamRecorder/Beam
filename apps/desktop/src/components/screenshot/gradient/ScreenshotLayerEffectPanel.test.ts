import { it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createGradientEffect, createColorEffect, createDitheringEffect, createArtisticEffect } from '@beam/engine';
import ScreenshotLayerEffectPanel from './ScreenshotLayerEffectPanel.vue';
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
it.each([
  createGradientEffect('gradient'),
  createColorEffect('color'),
  createColorEffect('mono', true),
  createDitheringEffect('dither'),
  createArtisticEffect('ascii', 'ascii'),
  createArtisticEffect('grain', 'grain'),
  createArtisticEffect('cyanotype', 'cyanotype'),
])('opens the inspector for $id and forwards all actions', (effect) => {
  const wrapper = mount(ScreenshotLayerEffectPanel, {
    props: { effect, disabled: true },
    global: {
      stubs: {
        ScreenshotGradientPanel: true,
        ScreenshotColorPanel: true,
        ScreenshotDitheringPanel: true,
        ScreenshotArtisticPanel: true,
      },
    },
  });
  const name =
    effect.kind === 'gradient'
      ? 'ScreenshotGradientPanel'
      : effect.kind === 'dithering'
        ? 'ScreenshotDitheringPanel'
        : effect.kind === 'color-adjustment'
          ? 'ScreenshotColorPanel'
          : 'ScreenshotArtisticPanel';
  const child = wrapper.findComponent({ name });
  expect(child.props('effect')).toEqual(effect);
  expect(child.props('disabled')).toBe(true);
  child.vm.$emit('update', { opacity: 20 });
  child.vm.$emit('remove');
  child.vm.$emit('back');
  expect(wrapper.emitted('update')).toEqual([[{ opacity: 20 }]]);
  expect(wrapper.emitted('remove')).toHaveLength(1);
  expect(wrapper.emitted('back')).toHaveLength(1);
  wrapper.unmount();
});
