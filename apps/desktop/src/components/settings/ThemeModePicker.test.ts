import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';
import ThemeModePicker from './ThemeModePicker.vue';
import { setCurrentLocale } from '~/i18n';
import type { ThemeMode } from '~/types/appearance';
enableAutoUnmount(afterEach);
const create = (mode: ThemeMode = 'light') => {
  const wrapper = mount(ThemeModePicker, {
    attachTo: document.body,
    props: {
      modelValue: mode,
      'onUpdate:modelValue': (value: ThemeMode) => wrapper.setProps({ modelValue: value }),
    },
  });
  return wrapper;
};
it('shows three clear previews, mode icons, and one accessible selection', async () => {
  const wrapper = create();
  expect(wrapper.findAll('.theme-preview')).toHaveLength(3);
  expect(wrapper.findAll('.preview-skin')).toHaveLength(4);
  expect(wrapper.findAll('[role="radio"]').map((button) => button.attributes('aria-label'))).toEqual([
    'Light',
    'Dark',
    'System',
  ]);
  expect(wrapper.findAll('[aria-checked="true"]')).toHaveLength(1);
  expect(wrapper.find('.choice-check').exists()).toBe(false);
  expect(wrapper.get('.theme-mode-group').classes()).toContain('variant-neutral');
  await wrapper.get('[aria-label="Dark"]').trigger('click');
  expect(wrapper.get('[aria-label="Dark"]').attributes('aria-checked')).toBe('true');
  expect(wrapper.get('[aria-label="Light"]').attributes('tabindex')).toBe('-1');
  await wrapper.get('[aria-label="System"]').trigger('click');
  expect(wrapper.props('modelValue')).toBe('system');
  expect(wrapper.get('.system-hint').text()).toContain('device');
});
it('supports arrows, Home and End with focus following the selected radio', async () => {
  const wrapper = create();
  const group = wrapper.get('[role="radiogroup"]');
  for (const [key, expected] of [
    ['ArrowLeft', 'system'],
    ['ArrowRight', 'light'],
    ['ArrowDown', 'dark'],
    ['ArrowUp', 'light'],
    ['End', 'system'],
    ['Home', 'light'],
  ] as const) {
    await group.trigger('keydown', { key });
    expect(wrapper.props('modelValue')).toBe(expected);
    expect(document.activeElement?.getAttribute('aria-checked')).toBe('true');
  }
  await group.trigger('keydown', { key: 'Tab' });
  expect(wrapper.props('modelValue')).toBe('light');
});
it('updates labels and the System explanation when the language changes', async () => {
  const wrapper = create('system');
  await setCurrentLocale('fr');
  expect(wrapper.get('[aria-label="Système"]').attributes('aria-checked')).toBe('true');
  expect(wrapper.get('.system-hint').text()).toContain('appareil');
  await setCurrentLocale('en');
});
