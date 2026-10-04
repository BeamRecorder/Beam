import { it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createGradientEffect, createColorEffect } from '@beam/engine';
import ScreenshotLayerEffectPanel from './ScreenshotLayerEffectPanel.vue';
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
it.each([createGradientEffect('gradient'), createColorEffect('color'), createColorEffect('mono', true)])(
  'opens the inspector for $id and forwards all actions',
  (effect) => {
    const wrapper = mount(ScreenshotLayerEffectPanel, {
      props: { effect, disabled: true },
      global: { stubs: { ScreenshotGradientPanel: true, ScreenshotColorPanel: true } },
    });
    const name = effect.kind === 'gradient' ? 'ScreenshotGradientPanel' : 'ScreenshotColorPanel';
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
  },
);
