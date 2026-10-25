import { flushPromises, mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import CaptureSettingsWindow from './CaptureSettingsWindow.vue';
const resize = vi.hoisted(() => ({ measure: () => {} }));
vi.mock('@vueuse/core', () => ({
  useResizeObserver: (_target: unknown, callback: () => void) => {
    resize.measure = callback;
  },
}));
it('reports bounded content including border and internal overflow, ignoring a hidden panel', async () => {
  const wrapper = mount(CaptureSettingsWindow, {
    props: { content: { visible: false, side: 'above', anchorX: 100, device: null }, label: 'Settings' },
  });
  resize.measure();
  expect(wrapper.emitted('fit')).toBeUndefined();
  Object.defineProperties(wrapper.get('main').element, {
    offsetHeight: { value: 200 },
    clientHeight: { value: 198 },
    scrollHeight: { value: 220 },
  });
  resize.measure();
  expect(wrapper.emitted('fit')).toEqual([[222]]);
  (wrapper.vm as unknown as { fit: () => void }).fit();
  expect(wrapper.emitted('fit')).toHaveLength(2);
  await wrapper.setProps({ content: { visible: true, side: 'below', anchorX: 40, device: null } });
  await flushPromises();
  expect(wrapper.get('.settings-shell').classes()).toContain('presented');
  wrapper.unmount();
  expect(() => resize.measure()).not.toThrow();
});
it('distinguishes settings, device and isolated preview surfaces', async () => {
  const wrapper = mount(CaptureSettingsWindow, {
    props: { content: { visible: false, side: 'above', anchorX: 100, device: null }, label: 'Settings', preview: true },
  });
  expect(wrapper.get('.settings-shell').classes()).toContain('preview');
  expect(wrapper.get('main').attributes('role')).toBe('dialog');
  await wrapper.setProps({
    content: {
      visible: true,
      side: 'below',
      anchorX: 30,
      device: { kind: 'camera', options: [{ id: 'off', label: 'Off' }], selectedId: 'off', position: { x: 0, y: 0 } },
    },
  });
  expect(wrapper.get('main').classes()).toContain('floating-surface');
  expect(wrapper.get('main').attributes('role')).toBeUndefined();
  wrapper.unmount();
});
it('suppresses the native browser context menu without changing panel geometry', () => {
  const wrapper = mount(CaptureSettingsWindow, {
    props: { content: { visible: true, side: 'above', anchorX: 100, device: null }, label: 'Settings' },
  });
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  wrapper.element.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  wrapper.unmount();
});
