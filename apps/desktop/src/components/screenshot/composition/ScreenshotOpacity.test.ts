import { it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Input from '~/ui/input/Input.vue';
import ScreenshotOpacity from './ScreenshotOpacity.vue';
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
it('offers the shared draggable numeric input with a prefix icon and percent suffix', async () => {
  const wrapper = mount(ScreenshotOpacity, { props: { modelValue: 50 } });
  expect(wrapper.get('input').attributes('type')).toBe('number');
  expect(wrapper.find('.input-prefix svg').exists()).toBe(true);
  expect(wrapper.get('.input-suffix').text()).toBe('%');
  await wrapper.get('input').trigger('mousedown', { button: 0, clientX: 100 });
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 120 }));
  window.dispatchEvent(new MouseEvent('mouseup'));
  expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([55]);
  wrapper.unmount();
});
it('clamps complete typed values and rejects empty or nonfinite edits', () => {
  const wrapper = mount(ScreenshotOpacity, { props: { modelValue: 50 } });
  for (const value of [-1, 101, '25.5', '', ' ', 'bad', Infinity])
    wrapper.findComponent(Input).vm.$emit('update:modelValue', value);
  expect(wrapper.emitted('update:modelValue')).toEqual([[0], [100], [25.5]]);
  wrapper.unmount();
});
it('guards disabled inputs against programmatic child events', () => {
  const wrapper = mount(ScreenshotOpacity, { props: { modelValue: 50, disabled: true } });
  wrapper.findComponent(Input).vm.$emit('update:modelValue', 60);
  expect(wrapper.get('input').attributes('disabled')).toBeDefined();
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  wrapper.unmount();
});
