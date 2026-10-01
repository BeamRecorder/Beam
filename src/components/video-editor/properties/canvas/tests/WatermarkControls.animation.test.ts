import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import WatermarkControls from '../WatermarkControls.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import { DEFAULT_WATERMARK, type WatermarkSettings } from '../../../canvas/output-canvas';

enableAutoUnmount(afterEach);
const controls = (value: Partial<WatermarkSettings> = {}) =>
  mount(WatermarkControls, {
    props: { modelValue: { ...DEFAULT_WATERMARK, enabled: true, ...value } },
    global: { stubs: { Switch: true, Input: true, BigSlider: true, ColorPicker: true } },
  });

describe('watermark selection animation', () => {
  it.each(['none', 'made-with-beam', 'beam', 'custom'] as const)(
    'slides the shared text indicator to %s',
    async (text) => {
      const wrapper = controls({ text: 'none' });
      const group = wrapper.findAllComponents(ButtonGroup)[0]!;
      const indicator = group.get('.selection-indicator').element;
      const index = ['none', 'made-with-beam', 'beam', 'custom'].indexOf(text);
      await group.findAll('button')[index]!.trigger('click');
      const emitted = wrapper.emitted('update:modelValue')!.at(-1)![0] as WatermarkSettings;
      expect(emitted.text).toBe(text);
      await wrapper.setProps({ modelValue: emitted });
      expect(group.props('selection')).toEqual({ count: 4, index });
      expect(group.get('.selection-indicator').element).toBe(indicator);
      expect(group.attributes('style')).toContain(`--button-group-index: ${index}`);
      expect(group.findAll('.btn-selected')).toHaveLength(1);
      expect(wrapper.find('input-stub').exists()).toBe(text === 'custom');
    },
  );

  it('animates all four positions with the same retained indicator', async () => {
    const wrapper = controls();
    const group = wrapper.findAllComponents(ButtonGroup)[1]!;
    const indicator = group.get('.selection-indicator').element;
    for (const [index, position] of ['top-left', 'top-right', 'bottom-left', 'bottom-right'].entries()) {
      await group.findAll('button')[index]!.trigger('click');
      const emitted = wrapper.emitted('update:modelValue')!.at(-1)![0] as WatermarkSettings;
      expect(emitted.position).toBe(position);
      await wrapper.setProps({ modelValue: emitted });
      expect(group.props('selection')).toEqual({ count: 4, index });
      expect(group.get('.selection-indicator').element).toBe(indicator);
    }
  });

  it('retains the text indicator during rapid changes and resizing', async () => {
    const wrapper = controls({ text: 'beam' });
    const group = wrapper.findAllComponents(ButtonGroup)[0]!;
    const indicator = group.get('.selection-indicator').element;
    await wrapper.setProps({ modelValue: { ...DEFAULT_WATERMARK, enabled: true, text: 'custom' } });
    await wrapper.setProps({ modelValue: { ...DEFAULT_WATERMARK, enabled: true, text: 'made-with-beam' } });
    window.dispatchEvent(new Event('resize'));
    expect(group.get('.selection-indicator').element).toBe(indicator);
    expect(group.classes()).toContain('variant-primary');
    expect(group.attributes('style')).toContain('--button-group-index: 1');
  });

  it('restores indicators to the saved choices after re-enabling the watermark', async () => {
    const wrapper = controls({ text: 'custom', position: 'top-right' });
    const value = wrapper.props('modelValue')!;
    await wrapper.setProps({ modelValue: { ...value, enabled: false } });
    expect(wrapper.findAllComponents(ButtonGroup)).toHaveLength(0);
    await wrapper.setProps({ modelValue: { ...value, enabled: true } });
    expect(wrapper.findAllComponents(ButtonGroup).map((group) => group.props('selection'))).toEqual([
      { count: 4, index: 3 },
      { count: 4, index: 1 },
    ]);
  });
});
