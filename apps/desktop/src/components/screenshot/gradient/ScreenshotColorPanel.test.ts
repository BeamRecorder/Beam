import { it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import Input from '~/ui/input/Input.vue';
import { createColorEffect, COLOR_RANGES, DEFAULT_COLOR_RECIPE } from '@beam/engine';
import ScreenshotColorPanel from './ScreenshotColorPanel.vue';
import ScreenshotOpacity from '../composition/ScreenshotOpacity.vue';
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
const panel = (disabled = false) =>
  mount(ScreenshotColorPanel, {
    props: { effect: createColorEffect('x'), disabled },
    global: {
      stubs: {
        Accordion: defineComponent({
          props: ['modelValue', 'title'],
          emits: ['update:modelValue'],
          template:
            '<section><button class="accordion-toggle" @click="$emit(\'update:modelValue\',!modelValue)">{{ title }}</button><slot /></section>',
        }),
      },
    },
  });
it('exposes the real bounded recipe fields and publishes complete immutable edits', async () => {
  const wrapper = panel();
  for (const key of Object.keys(COLOR_RANGES)) expect(wrapper.find(`input[aria-label="${key}"]`).exists()).toBe(true);
  await wrapper.get('input[aria-label="hue"]').setValue('-45');
  await wrapper.get('input[aria-label="hue"]').trigger('blur');
  expect(wrapper.emitted('update')?.[0]).toEqual([{ recipe: { ...DEFAULT_COLOR_RECIPE, hue: -45 } }]);
  expect(wrapper.props('effect').recipe.hue).toBe(0);
  await wrapper.get('input[aria-label="saturation"]').setValue('250');
  await wrapper.get('input[aria-label="saturation"]').trigger('blur');
  expect(wrapper.emitted('update')?.[1]).toEqual([{ recipe: { ...DEFAULT_COLOR_RECIPE, saturation: 200 } }]);
  await wrapper.get('.accordion-toggle').trigger('click');
  wrapper.unmount();
});
it('rejects incomplete/nonfinite fields and prevents disabled mutation', () => {
  const wrapper = panel();
  const input =
    wrapper
      .findAllComponents(Input)
      .find(
        (item) => item.attributes('aria-label') === undefined && item.get('input').attributes('aria-label') === 'hue',
      ) ?? wrapper.findAllComponents(Input)[1]!;
  for (const value of ['', ' ', 'invalid', Infinity]) input.vm.$emit('update:modelValue', value);
  expect(wrapper.emitted('update')).toBeUndefined();
  wrapper.unmount();
  const disabled = panel(true);
  disabled.findAllComponents(Input)[1]!.vm.$emit('update:modelValue', 90);
  expect(disabled.emitted('update')).toBeUndefined();
  expect(disabled.get('fieldset').attributes('inert')).toBeDefined();
  disabled.unmount();
});
it('routes opacity, enable, reset, delete and back actions', async () => {
  const wrapper = panel();
  wrapper.findComponent(ScreenshotOpacity).vm.$emit('update:modelValue', 40);
  await wrapper.get('[role="switch"]').trigger('click');
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'reset')!
    .trigger('click');
  await wrapper.get('[aria-label="remove"]').trigger('click');
  await wrapper.get('[aria-label="back"]').trigger('click');
  expect(wrapper.emitted('update')).toEqual([
    [{ opacity: 40 }],
    [{ enabled: false }],
    [{ recipe: DEFAULT_COLOR_RECIPE }],
  ]);
  expect(wrapper.emitted('remove')).toHaveLength(1);
  expect(wrapper.emitted('back')).toHaveLength(1);
  wrapper.unmount();
});
