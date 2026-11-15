import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ShadowDistanceControl from './ShadowDistanceControl.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';

const global = {
  stubs: {
    BigSlider: {
      props: ['modelValue', 'label', 'min', 'max', 'formatValue'],
      emits: ['update:modelValue'],
      template: '<button>{{ label }}</button>',
    },
  },
};
describe('shared shadow distance control', () => {
  it('labels the numeric distance and uses the same bounds and pixel unit everywhere', () => {
    const wrapper = mount(ShadowDistanceControl, { props: { modelValue: 25 }, global });
    const slider = wrapper.findComponent(BigSlider);
    expect(slider.props()).toMatchObject({ label: 'Shadow distance', min: 0, max: 256, modelValue: 25 });
    expect(slider.props('formatValue')?.(25)).toBe('25px');
  });
  it('forwards a zero distance as an explicit choice', () => {
    const wrapper = mount(ShadowDistanceControl, { props: { modelValue: 25 }, global });
    wrapper.findComponent(BigSlider).vm.$emit('update:modelValue', 0);
    expect(wrapper.emitted('update:modelValue')).toEqual([[0]]);
  });
  it('disables pointer and keyboard interaction for centered all-around shadows', async () => {
    const wrapper = mount(ShadowDistanceControl, { props: { modelValue: 25, disabled: true }, global });
    expect(wrapper.attributes('inert')).toBeDefined();
    expect(wrapper.attributes('aria-disabled')).toBe('true');
    await wrapper.setProps({ disabled: false });
    expect(wrapper.attributes('inert')).toBeUndefined();
  });
});
