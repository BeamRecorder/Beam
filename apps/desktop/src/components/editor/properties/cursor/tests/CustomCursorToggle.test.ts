import { ref } from 'vue';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';
import CustomCursorToggle from '../CustomCursorToggle.vue';
import { customCursorKey } from '../custom-cursor-context';
import InfoTooltip from '~/ui/tooltip/InfoTooltip.vue';
import RealCursorPreference from '~/components/hud/settings/RealCursorPreference.vue';
enableAutoUnmount(afterEach);
it('toggles the actual editor overlay state from the titlebar', async () => {
  const enabled = ref(false);
  const wrapper = mount(CustomCursorToggle, {
    global: { provide: { [customCursorKey as symbol]: enabled } },
  });
  expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false');
  await wrapper.get('[role="switch"]').trigger('click');
  expect(enabled.value).toBe(true);
  await wrapper.get('[role="switch"]').trigger('click');
  expect(enabled.value).toBe(false);
  expect(wrapper.findComponent(InfoTooltip).props('content')).toContain('system cursor');
});
it('does not render a toggle outside the video editor cursor context', () => {
  expect(mount(CustomCursorToggle).find('[role="switch"]').exists()).toBe(false);
});
it('explains the native recording cursor and emits the boolean choice', async () => {
  const wrapper = mount(RealCursorPreference);
  expect(wrapper.text()).toContain('Show real cursor');
  expect(wrapper.findComponent(InfoTooltip).props('content')).toContain('Automatic zooms');
  await wrapper.get('[role="switch"]').trigger('click');
  expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
  await wrapper.setProps({ modelValue: true });
  await wrapper.get('[role="switch"]').trigger('click');
  expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([false]);
});
