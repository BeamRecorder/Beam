import { mount } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
const { capture } = vi.hoisted(() => ({ capture: { platform: 'win32' } }));
vi.mock('~/api/capture', () => ({ capture }));
vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({ t: (key: string) => key }),
}));
import RegionQuickSettings from './RegionQuickSettings.vue';
import CaptureQuickSettingsPanel from './CaptureQuickSettingsPanel.vue';
const settings = {
  cameraId: 'off',
  microphoneId: 'no-audio',
  systemAudio: false,
  countdownSeconds: 3,
  hideTaskbar: false,
  hideDesktopIcons: false,
  showRealCursor: false,
  zoomMode: '2d' as const,
};
const Popover = { template: '<div><slot name="trigger" :is-open="true" /><slot /></div>' };
const Select = {
  props: ['modelValue', 'options', 'label', 'disabled'],
  emits: ['update:modelValue', 'toggle'],
  template: '<button />',
};
const Switch = {
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  template: '<button :disabled="disabled" />',
};
const mountSettings = () =>
  mount(RegionQuickSettings, {
    props: { modelValue: { ...settings } },
    global: { stubs: { Popover, Select, Switch } },
  });
beforeEach(() => {
  capture.platform = 'win32';
});
it.each([0, 1, 10])('offers every countdown and saves %s', (seconds) => {
  const wrapper = mountSettings();
  const countdown = wrapper.findAllComponents(Select).find((select) => select.props('label') === 'countdown')!;
  expect(countdown.props('options')).toHaveLength(11);
  countdown.vm.$emit('update:modelValue', seconds);
  expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ ...settings, countdownSeconds: seconds }]);
  wrapper.unmount();
});
it.each(['off', '2d', '3d', 'glass'])('shares the %s zoom preference with the region toolbar', (zoomMode) => {
  const wrapper = mountSettings();
  wrapper
    .findAllComponents(Select)
    .find((select) => select.props('label') === 'zoom')!
    .vm.$emit('update:modelValue', zoomMode);
  expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ ...settings, zoomMode }]);
  wrapper.unmount();
});
it('offers the shared Loupe algorithm alongside OFF, 2D and 3D', () => {
  const wrapper = mountSettings();
  const zoom = wrapper.findAllComponents(Select).find((select) => select.props('label') === 'zoom')!;
  expect(zoom.props('options')).toEqual([
    { value: 'off', label: 'off' },
    { value: '2d', label: '2D' },
    { value: '3d', label: '3D' },
    { value: 'glass', label: 'loupe' },
  ]);
  wrapper.unmount();
});
it('reserves presets for Quick Snip and passes ten example presets to the shared scrollable Select', () => {
  const presets = Array.from({ length: 10 }, (_, index) => ({ value: `preset-${index}`, label: `Preset ${index}` }));
  const wrapper = mount(CaptureQuickSettingsPanel, {
    props: { modelValue: settings, showPreset: true, presets, presetId: 'preset-0' },
    global: { stubs: { Select, Switch } },
  });
  const select = wrapper.findAllComponents(Select).find((select) => select.props('label') === 'preset')!;
  expect(select.props('options')).toEqual(presets);
  select.vm.$emit('update:modelValue', 'preset-9');
  expect(wrapper.emitted('preset')).toEqual([['preset-9']]);
  wrapper.unmount();
  const region = mountSettings();
  expect(region.findAllComponents(Select).some((select) => select.props('label') === 'preset')).toBe(false);
  region.unmount();
});
it('disables desktop hiding on Linux while keeping real cursor capture available', () => {
  capture.platform = 'linux';
  const wrapper = mountSettings();
  expect(
    wrapper
      .findAllComponents(Switch)
      .slice(1)
      .every((control) => control.props('disabled')),
  ).toBe(true);
  expect(wrapper.text()).toContain('desktopUnavailable');
  wrapper.findAllComponents(Switch)[0]!.vm.$emit('update:modelValue', true);
  expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ ...settings, showRealCursor: true }]);
  wrapper.unmount();
});
it('uses Dock terminology and capture-only filtering on macOS', () => {
  capture.platform = 'darwin';
  const wrapper = mountSettings();
  expect(wrapper.text()).toContain('hideDock');
  expect(wrapper.text()).toContain('captureOnly');
  wrapper.unmount();
});
it('hides recording controls for screenshots while retaining presets and desktop hiding', () => {
  const wrapper = mount(CaptureQuickSettingsPanel, {
    props: { modelValue: settings, showPreset: true, screenshot: true },
    global: { stubs: { Select, Switch } },
  });
  expect(wrapper.findAllComponents(Select).map((control) => control.props('label'))).toEqual(['preset', 'countdown']);
  expect(wrapper.findAllComponents(Switch)).toHaveLength(2);
  wrapper.unmount();
});
it('forwards open menus and dismisses on Escape unless a nested control already handled it', async () => {
  const wrapper = mount(CaptureQuickSettingsPanel, {
    props: { modelValue: settings, showPreset: true },
    global: { stubs: { Select, Switch } },
  });
  for (const select of wrapper.findAllComponents(Select)) {
    select.vm.$emit('toggle', true);
    select.vm.$emit('toggle', false);
  }
  expect(wrapper.emitted('toggle')).toEqual([[true], [false], [true], [false], [true], [false]]);
  await wrapper.trigger('keydown', { key: 'Enter' });
  expect(wrapper.emitted('dismiss')).toBeUndefined();
  const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  handled.preventDefault();
  wrapper.element.dispatchEvent(handled);
  expect(wrapper.emitted('dismiss')).toBeUndefined();
  await wrapper.trigger('keydown', { key: 'Escape' });
  expect(wrapper.emitted('dismiss')).toEqual([[]]);
  wrapper.unmount();
});
it.each(['hideTaskbar', 'hideDesktopIcons'] as const)('updates the shared %s preference', (key) => {
  const wrapper = mount(CaptureQuickSettingsPanel, {
    props: { modelValue: settings },
    global: { stubs: { Select, Switch } },
  });
  wrapper.findAllComponents(Switch)[key === 'hideTaskbar' ? 1 : 2].vm.$emit('update:modelValue', true);
  expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ ...settings, [key]: true }]);
  wrapper.unmount();
});
it('keeps 2D as the initial choice and disables all selectors during a settings update', () => {
  const wrapper = mount(CaptureQuickSettingsPanel, {
    props: { modelValue: { ...settings, zoomMode: undefined }, showPreset: true, disabled: true },
    global: { stubs: { Select, Switch } },
  });
  const selects = wrapper.findAllComponents(Select);
  expect(selects.find((select) => select.props('label') === 'zoom')!.props('modelValue')).toBe('2d');
  expect(selects.find((select) => select.props('label') === 'preset')!.props('modelValue')).toBe('default');
  expect(selects.every((select) => select.props('disabled'))).toBe(true);
  wrapper.unmount();
});
