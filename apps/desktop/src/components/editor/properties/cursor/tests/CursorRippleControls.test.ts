import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
vi.mock('~/api/capture', () => ({ capture: {} }));
import CursorRippleControls from '../CursorRippleControls.vue';
import { createDefaultCursorClickEffects } from '@beam/engine/capture/cursor-settings';
import { DEFAULT_CURSOR_WATER_RIPPLE } from '@beam/engine/capture/cursor-click-schema';
import { global, Select } from './cursor-panel-test-helpers';
const effect = () => ({ ...createDefaultCursorClickEffects().left, rippleEnabled: true });
const build = (modelValue = effect()) => mount(CursorRippleControls, { props: { modelValue }, global });

describe('mode-specific click controls', () => {
  it('hides every mode choice and setting until the effect is enabled', async () => {
    const wrapper = build({ ...effect(), rippleEnabled: false });
    expect(wrapper.find('.ripple-controls').exists()).toBe(false);
    await wrapper.setProps({ modelValue: effect() });
    expect(wrapper.findComponent(Select).exists()).toBe(true);
    await wrapper.setProps({ modelValue: { ...effect(), rippleEnabled: false } });
    expect(wrapper.findComponent(Select).exists()).toBe(false);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
  it.each(['single', 'double', 'solid', 'water'] as const)(
    'selects %s without activating another effect or replacing settings',
    async (style) => {
      const value = effect(),
        wrapper = build(value);
      expect(wrapper.findComponent(Select).props('options')).toContainEqual(
        expect.objectContaining({ value: style, thumbnail: expect.stringContaining('/click-previews/') }),
      );
      wrapper.findComponent(Select).vm.$emit('update:modelValue', style);
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ ...value, rippleStyle: style }]);
    },
  );
  it.each([123, 'bad'])('ignores invalid mode %s', (value) => {
    const wrapper = build();
    wrapper.findComponent(Select).vm.$emit('update:modelValue', value);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
  it('ignores stale selector events after an effect was disabled', async () => {
    const wrapper = build(),
      select = wrapper.findComponent(Select);
    await wrapper.setProps({ modelValue: { ...effect(), rippleEnabled: false } });
    select.vm.$emit('update:modelValue', 'water');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
  it.each(['single', 'double', 'solid'] as const)(
    'edits size, opacity, duration, width and color for %s',
    async (style) => {
      const value = { ...effect(), rippleStyle: style },
        wrapper = build(value);
      const settings = [
        ['Ripple Size', 'rippleSize'],
        ['Opacity', 'rippleOpacity'],
        ['Duration', 'rippleDurationMs'],
        ['Line width', 'rippleWidth'],
      ] as const;
      for (const [label, key] of settings) {
        const slider = wrapper.get(`[data-label="${label}"]`);
        await slider.trigger('click');
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ ...value, [key]: 30 }]);
      }
      expect(wrapper.get('[data-label="Ripple Size"]').attributes('data-min')).toBe('1');
      await wrapper.get('.cursor-color').trigger('click');
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ ...value, rippleColor: '#fff' }]);
      expect(wrapper.find('[data-label="Refraction intensity"]').exists()).toBe(false);
    },
  );
  it('provides subtle water defaults and independent intensity, spread, duration and softness', async () => {
    const value = { ...effect(), rippleStyle: 'water' as const },
      wrapper = build(value);
    const fields = [
      ['Refraction intensity', 'intensity'],
      ['Wave spread', 'spread'],
      ['Duration', 'durationMs'],
      ['Wave softness', 'width'],
    ] as const;
    for (const [label, key] of fields) {
      const slider = wrapper.get(`[data-label="${label}"]`);
      expect(slider.attributes('data-model-value')).toBe(String(DEFAULT_CURSOR_WATER_RIPPLE[key]));
      const updated = key === 'durationMs' ? 400 : 1;
      wrapper
        .findAllComponents(global.stubs.BigSlider)
        .find((component) => component.props('label') === label)!
        .vm.$emit('update:modelValue', updated);
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
        { ...value, water: { ...DEFAULT_CURSOR_WATER_RIPPLE, [key]: updated } },
      ]);
    }
    expect(wrapper.get('[data-label="Wave spread"]').attributes('data-min')).toBe('1');
    expect(wrapper.find('.cursor-color').exists()).toBe(false);
    expect(wrapper.find('[data-label="Ripple Size"]').exists()).toBe(false);
  });
  it('defaults legacy optional settings and preserves them across mode changes', async () => {
    const value = {
      ...effect(),
      rippleWidth: undefined,
      rippleOpacity: undefined,
      rippleDurationMs: undefined,
      water: undefined,
    };
    const wrapper = build(value);
    expect(wrapper.get('[data-label="Opacity"]').text()).toBe('65%');
    expect(wrapper.get('[data-label="Duration"]').text()).toBe('0.50 s');
    await wrapper.setProps({ modelValue: { ...value, rippleStyle: 'water' } });
    expect(wrapper.get('[data-label="Wave spread"]').text()).toBe('18%');
    await wrapper.setProps({ modelValue: { ...value, rippleStyle: 'none' } });
    expect(wrapper.findComponent(Select).props('modelValue')).toBe('single');
    await wrapper.setProps({ modelValue: { ...value, rippleStyle: undefined } });
    expect(wrapper.findComponent(Select).props('modelValue')).toBe('single');
  });
});
