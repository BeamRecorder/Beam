import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createGradientEffect, createColorEffect } from '@beam/engine';
import { effectThumbnailId } from '../composition/thumbnails/effect-thumbnail';
import ScreenshotLayerEffectList from './ScreenshotLayerEffectList.vue';
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
const layer = {
  id: 'layer',
  name: 'Shape',
  kind: 'shape' as const,
  visible: true,
  locked: false,
  opacity: 100,
  blendMode: 'source-over' as const,
  effects: [createGradientEffect('first'), { ...createGradientEffect('second'), enabled: false }],
};
describe('Composition attached effect rows', () => {
  it('displays the actual cumulative effect preview beside its effect kind', async () => {
    const wrapper = mount(ScreenshotLayerEffectList, {
      props: {
        layer: { ...layer, effects: [createColorEffect('color')] },
        thumbnails: { [effectThumbnailId('layer', 'color')]: { revision: 1, status: 'ready', url: 'blob:color' } },
      },
    });
    expect(wrapper.get('.effect-select img').attributes('src')).toBe('blob:color');
    expect(wrapper.text()).toContain('title');
    await wrapper.get('.effect-select').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['color']]);
    wrapper.unmount();
  });
  it('selects and toggles the actual effect ID and marks the selected effect', async () => {
    const wrapper = mount(ScreenshotLayerEffectList, {
      attachTo: document.body,
      props: { layer, selectedEffectId: 'second' },
    });
    const buttons = wrapper.findAll('button');
    await buttons[0]!.trigger('click');
    await buttons[1]!.trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['first']);
    expect(wrapper.emitted('toggle')?.[0]).toEqual(['first']);
    expect(buttons[2]!.attributes('aria-pressed')).toBe('true');
    expect(wrapper.text()).toContain('2');
    for (const event of ['pointerdown', 'dblclick', 'contextmenu']) {
      const handler = vi.fn();
      const parent = wrapper.element.parentElement!;
      parent.addEventListener(event, handler);
      await wrapper.get('.layer-effect-list').trigger(event);
      expect(handler).not.toHaveBeenCalled();
      parent.removeEventListener(event, handler);
    }
    wrapper.unmount();
  });
  it('keeps locked effects inspectable while disabling mutation and disables busy editors', async () => {
    const wrapper = mount(ScreenshotLayerEffectList, { props: { layer: { ...layer, locked: true } } });
    const buttons = wrapper.findAll('button');
    expect(buttons[0]!.attributes('disabled')).toBeUndefined();
    expect(buttons[1]!.attributes('disabled')).toBeDefined();
    await wrapper.setProps({ disabled: true });
    await buttons[0]!.trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
    wrapper.unmount();
  });
  it('does not render an empty effects branch and shows the active-state action', () => {
    const wrapper = mount(ScreenshotLayerEffectList, { props: { layer: { ...layer, effects: [] } } });
    expect(wrapper.find('.layer-effect-list').exists()).toBe(false);
    wrapper.unmount();
    const single = mount(ScreenshotLayerEffectList, {
      props: { layer: { ...layer, effects: [createGradientEffect('only')] } },
    });
    expect(single.find('button[aria-label="disable"]').exists()).toBe(true);
    single.unmount();
  });
});
