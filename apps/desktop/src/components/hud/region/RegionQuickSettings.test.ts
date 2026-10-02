import { mount } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
const { capture, close } = vi.hoisted(() => ({
  capture: { platform: 'win32' },
  close: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));
vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({ t: (key: string) => key }),
}));
import RegionQuickSettings from './RegionQuickSettings.vue';
const settings = {
  cameraId: 'off',
  microphoneId: 'no-audio',
  systemAudio: false,
  countdownSeconds: 3,
  hideTaskbar: false,
  hideDesktopIcons: false,
  showRealCursor: false,
};
const Popover = {
  setup: () => ({ close }),
  template: '<div><slot name="trigger" :is-open="true" /><slot :close="close" /></div>',
};
const Menu = {
  props: ['items'],
  emits: ['select', 'dismiss'],
  template: '<div />',
};
const Switch = {
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  template: '<button :disabled="disabled" />',
};
const mountSettings = (countdownSeconds = 3) =>
  mount(RegionQuickSettings, {
    props: { modelValue: { ...settings, countdownSeconds } },
    global: {
      stubs: {
        Popover,
        PopoverMenuList: Menu,
        Switch,
        Button: { template: '<button />' },
      },
    },
  });
beforeEach(() => {
  capture.platform = 'win32';
  close.mockClear();
});
it.each([0, 1, 10])('exposes the hover submenu with all eleven countdown values, current %s', (seconds) => {
  const wrapper = mountSettings(seconds);
  const items = wrapper.findComponent(Menu).props('items');
  expect(items[0].label).toBe(`countdown · ${seconds ? `${seconds}s` : 'off'}`);
  expect(items[0].children).toHaveLength(11);
  expect(items[0].children[seconds].active).toBe(true);
  wrapper.findComponent(Menu).vm.$emit('select', '10');
  expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ ...settings, countdownSeconds: 10 }]);
  expect(close).toHaveBeenCalled();
  wrapper.unmount();
});
it('switches the native Windows desktop options and closes on dismissal', () => {
  const wrapper = mountSettings();
  const switches = wrapper.findAllComponents(Switch).slice(1);
  switches[0]!.vm.$emit('update:modelValue', true);
  switches[1]!.vm.$emit('update:modelValue', true);
  expect(wrapper.emitted('update:modelValue')).toEqual([
    [{ ...settings, hideTaskbar: true }],
    [{ ...settings, hideTaskbar: true, hideDesktopIcons: true }],
  ]);
  wrapper.findComponent(Menu).vm.$emit('dismiss');
  expect(close).toHaveBeenCalledOnce();
  wrapper.unmount();
});
it('disables both desktop switches on Linux and explains availability', () => {
  capture.platform = 'linux';
  const wrapper = mountSettings();
  expect(
    wrapper
      .findAllComponents(Switch)
      .slice(1)
      .every((control) => control.props('disabled')),
  ).toBe(true);
  expect(wrapper.text()).toContain('desktopUnavailable');
  wrapper.unmount();
});
it('labels the macOS Dock and explains that native filtering affects the recording', () => {
  capture.platform = 'darwin';
  const wrapper = mountSettings();
  expect(wrapper.text()).toContain('hideDock');
  expect(wrapper.text()).toContain('captureOnly');
  expect(wrapper.findAllComponents(Switch)[1]!.props('disabled')).toBe(false);
  wrapper.unmount();
});

it('keeps the real cursor available on Linux and updates the shared setting', () => {
  capture.platform = 'linux';
  const wrapper = mountSettings();
  const toggle = wrapper.findAllComponents(Switch)[0]!;
  expect(toggle.props('disabled')).not.toBe(true);
  toggle.vm.$emit('update:modelValue', true);
  expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ ...settings, showRealCursor: true }]);
  wrapper.unmount();
});
