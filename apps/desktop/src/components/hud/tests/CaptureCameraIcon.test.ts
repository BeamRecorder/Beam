import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import { Camera, CameraOff } from '@lucide/vue';
import CaptureCameraIcon from '../CaptureCameraIcon.vue';
it('marks a switched-off camera with the shared red state and crossed-out icon', () => {
  const wrapper = mount(CaptureCameraIcon, { props: { enabled: false } });
  expect(wrapper.findComponent(CameraOff).exists()).toBe(true);
  expect(wrapper.classes()).toContain('is-off');
  expect(wrapper.attributes('width')).toBe('14');
  wrapper.unmount();
});
it('restores the ordinary camera icon when a real camera is selected', async () => {
  const wrapper = mount(CaptureCameraIcon, { props: { enabled: false } });
  await wrapper.setProps({ enabled: true });
  expect(wrapper.findComponent(Camera).exists()).toBe(true);
  expect(wrapper.classes()).not.toContain('is-off');
  wrapper.unmount();
});
it('preserves the requested size and propagates an accessible name', () => {
  const wrapper = mount(CaptureCameraIcon, { props: { enabled: true, size: 18 }, attrs: { 'aria-label': 'Camera' } });
  expect(wrapper.attributes('width')).toBe('18');
  expect(wrapper.attributes('aria-label')).toBe('Camera');
  wrapper.unmount();
});
