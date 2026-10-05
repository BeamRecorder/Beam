import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
vi.mock('~/api/capture', () => ({ capture: {} }));
import CursorClickEffectsPanel from '../CursorClickEffectsPanel.vue';
import CursorRippleControls from '../CursorRippleControls.vue';
import { createDefaultCursorClickEffects } from '@beam/engine/capture/cursor-settings';
import { global } from './cursor-panel-test-helpers';
const build = () => {
  const value = createDefaultCursorClickEffects();
  return { value, wrapper: mount(CursorClickEffectsPanel, { props: { modelValue: value }, global }) };
};
describe('independent click accordions', () => {
  it('starts with both sections collapsed and retains their controls while reopening', async () => {
    const { wrapper } = build();
    expect(wrapper.findAll('.accordion-title').map((title) => title.text())).toEqual(['Left click', 'Right click']);
    for (const section of wrapper.findAll('.accordion')) {
      expect(section.get('.accordion-content').attributes('inert')).toBeDefined();
      await section.get('.accordion-trigger').trigger('click');
      expect(section.get('.accordion-content').attributes('inert')).toBeUndefined();
      await section.get('.accordion-trigger').trigger('click');
    }
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
  it.each(['left', 'right'] as const)('changes only the %s button activation and bounce', async (button) => {
    const { wrapper, value } = build();
    const section = wrapper.get(`[data-cursor-section="${button}"]`);
    await section.get('[aria-label="Click bounce"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      { ...value, [button]: { ...value[button], springEnabled: false } },
    ]);
    await section.get('[aria-label="Click Ripple Effect"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      { ...value, [button]: { ...value[button], rippleEnabled: true } },
    ]);
    await section.get('[data-label="Bounce intensity"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      { ...value, [button]: { ...value[button], springIntensity: 30 } },
    ]);
  });
  it('forwards different modes and settings without editing the other click', () => {
    const { wrapper, value } = build();
    const controls = wrapper.findAllComponents(CursorRippleControls);
    const left = { ...value.left, rippleStyle: 'water', water: { intensity: 1, spread: 1, durationMs: 400, width: 1 } };
    controls[0]!.vm.$emit('update:modelValue', left);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ ...value, left }]);
    const right = { ...value.right, rippleStyle: 'solid', rippleOpacity: 10 };
    controls[1]!.vm.$emit('update:modelValue', right);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ ...value, right }]);
  });
  it.each(['none', undefined] as const)('activates the default ring from legacy style %s', async (rippleStyle) => {
    const { wrapper, value } = build();
    await wrapper.setProps({ modelValue: { ...value, left: { ...value.left, rippleStyle, springEnabled: false } } });
    expect(wrapper.get('[data-cursor-section="left"]').find('[data-label="Bounce intensity"]').exists()).toBe(false);
    await wrapper.get('[data-cursor-section="left"] [aria-label="Click Ripple Effect"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      { ...value, left: { ...value.left, springEnabled: false, rippleStyle: 'single', rippleEnabled: true } },
    ]);
  });
});
