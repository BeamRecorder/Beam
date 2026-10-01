import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const capture = vi.hoisted(() => ({ platform: 'win32' }));
vi.mock('~/api/capture', () => ({ capture }));
import RecordingDesktopPreferences from './RecordingDesktopPreferences.vue';
enableAutoUnmount(afterEach);
beforeEach(() => {
  capture.platform = 'win32';
});
it('uses the shared desktop switches and relays each setting independently', async () => {
  const wrapper = mount(RecordingDesktopPreferences);
  await wrapper.get('[aria-label="Hide taskbar"]').trigger('click');
  await wrapper.get('[aria-label="Hide desktop icons"]').trigger('click');
  expect(wrapper.emitted('update:hideTaskbar')).toEqual([[true]]);
  expect(wrapper.emitted('update:hideDesktopIcons')).toEqual([[true]]);
  expect(wrapper.find('.platform-note').exists()).toBe(false);
});
it('labels the Dock on macOS and explains filtering during recording', () => {
  capture.platform = 'darwin';
  const wrapper = mount(RecordingDesktopPreferences, { props: { hideTaskbar: true, hideDesktopIcons: true } });
  expect(wrapper.get('[aria-label="Hide Dock"]').attributes('aria-checked')).toBe('true');
  expect(wrapper.get('.platform-note').text()).toContain('macOS');
  expect(wrapper.get('[aria-label="Hide desktop icons"]').attributes('aria-checked')).toBe('true');
});
it('disables unavailable desktop changes on Linux and describes the limitation', async () => {
  capture.platform = 'linux';
  const wrapper = mount(RecordingDesktopPreferences);
  for (const toggle of wrapper.findAll('[role="switch"]')) {
    expect(toggle.attributes('disabled')).toBeDefined();
    await toggle.trigger('click');
  }
  expect(wrapper.emitted('update:hideTaskbar')).toBeUndefined();
  expect(wrapper.emitted('update:hideDesktopIcons')).toBeUndefined();
  expect(wrapper.get('.platform-note').text()).toContain('Linux');
});
