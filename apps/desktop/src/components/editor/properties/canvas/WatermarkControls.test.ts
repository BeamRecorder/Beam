import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_WATERMARK } from '@beam/engine/layout/output-canvas';
import WatermarkControls from './WatermarkControls.vue';
import ShadowDistanceControl from '../shared/ShadowDistanceControl.vue';
import ShadowDirectionGroup from '../cursor/ShadowDirectionGroup.vue';
vi.mock('~/api/capture', () => ({ capture: {} }));
const global = {
  stubs: { BigSlider: true, ColorPicker: true, Input: true, Button: true, ButtonGroup: true, Switch: true },
};
describe('watermark shadow distance', () => {
  it('retains centered legacy shadows and disables displacement until a direction is chosen', () => {
    const wrapper = mount(WatermarkControls, {
      props: { modelValue: { ...DEFAULT_WATERMARK, enabled: true } },
      global,
    });
    expect(wrapper.findComponent(ShadowDistanceControl).props()).toMatchObject({ modelValue: 0, disabled: true });
    expect(wrapper.findComponent(ShadowDirectionGroup).props('modelValue')).toBe('all');
  });
  it('edits distance independently of the existing shadow strength', () => {
    const wrapper = mount(WatermarkControls, {
      props: {
        modelValue: { ...DEFAULT_WATERMARK, enabled: true, shadow: 70, shadowDistance: 40, shadowDirection: 'bottom' },
      },
      global,
    });
    wrapper.findComponent(ShadowDistanceControl).vm.$emit('update:modelValue', 0);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      expect.objectContaining({ shadow: 70, shadowDistance: 0, shadowDirection: 'bottom' }),
    ]);
  });
  it('keeps the chosen distance when changing shadow direction', () => {
    const wrapper = mount(WatermarkControls, {
      props: { modelValue: { ...DEFAULT_WATERMARK, enabled: true, shadowDistance: 40 } },
      global,
    });
    wrapper.findComponent(ShadowDirectionGroup).vm.$emit('update:modelValue', 'top-left');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      expect.objectContaining({ shadowDistance: 40, shadowDirection: 'top-left' }),
    ]);
  });
});
