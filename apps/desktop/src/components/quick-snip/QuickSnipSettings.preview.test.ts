import { flushPromises, mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
const bridge = vi.hoisted(() => ({
  platform: 'linux',
  onQuickSnipConfigure: vi.fn(() => () => {}),
  notifyQuickSnipSettingsReady: vi.fn(),
  configureQuickSnip: vi.fn(),
  selectEditorPreset: vi.fn(),
  getEditorPresets: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture: bridge }));
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
it('previews ten artificial presets without reading or writing the user preset collection', async () => {
  history.replaceState(null, '', '/html/quick-snip-preview.html?preview=1');
  const { default: Component } = await import('./QuickSnipSettings.vue');
  const wrapper = mount(Component, { global: { stubs: { CaptureQuickSettingsPanel: true } } });
  const panel = wrapper.getComponent({ name: 'CaptureQuickSettingsPanel' });
  expect(panel.props('presets')).toHaveLength(10);
  expect(panel.props('presetId')).toBe('demo-0');
  panel.vm.$emit('preset', 'demo-9');
  panel.vm.$emit('update:modelValue', { ...panel.props('modelValue'), zoomMode: 'off' });
  await flushPromises();
  expect(panel.props('presetId')).toBe('demo-9');
  expect(bridge.getEditorPresets).not.toHaveBeenCalled();
  expect(bridge.selectEditorPreset).not.toHaveBeenCalled();
  expect(bridge.configureQuickSnip).not.toHaveBeenCalled();
  wrapper.unmount();
  history.replaceState(null, '', '/');
});
