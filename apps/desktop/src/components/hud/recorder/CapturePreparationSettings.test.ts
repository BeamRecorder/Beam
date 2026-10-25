import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RegionRecordingSettings } from '~/api/types/screen-region';
import type { QuickSnipSettingsContent } from '~/api/types/quick-snip-settings';
import CapturePreparationSettings from './CapturePreparationSettings.vue';
import CaptureQuickSettingsPanel from '../region/CaptureQuickSettingsPanel.vue';
import QuickSnipDeviceChoices from '../../quick-snip/QuickSnipDeviceChoices.vue';
const api = vi.hoisted(() => ({
  onConfigure: vi.fn<(listener: (settings: RegionRecordingSettings) => void) => () => void>(),
  onContent: vi.fn<(listener: (content: QuickSnipSettingsContent) => void) => () => void>(),
  update: vi.fn(),
  fit: vi.fn(),
  ready: vi.fn(),
  selectDevice: vi.fn(),
  dismiss: vi.fn(),
  off: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture: { preparation: api } }));
enableAutoUnmount(afterEach);
const settings: RegionRecordingSettings = {
  cameraId: 'off',
  microphoneId: 'no-audio',
  systemAudio: false,
  countdownSeconds: 3,
  hideTaskbar: false,
  hideDesktopIcons: false,
  showRealCursor: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  api.onConfigure.mockReturnValue(api.off);
  api.onContent.mockReturnValue(api.off);
  api.update.mockResolvedValue(undefined);
});
const render = () =>
  mount(CapturePreparationSettings, {
    global: { stubs: { CaptureQuickSettingsPanel: true, QuickSnipDeviceChoices: true } },
  });
it('subscribes before readiness and waits for real settings before rendering controls', async () => {
  const wrapper = render();
  expect(api.ready).toHaveBeenCalledOnce();
  expect(wrapper.findComponent(CaptureQuickSettingsPanel).exists()).toBe(false);
  api.onConfigure.mock.calls[0]![0](settings);
  await flushPromises();
  expect(wrapper.getComponent(CaptureQuickSettingsPanel).props('modelValue')).toEqual(settings);
});
it('edits the shared settings without presets and reports persistence failure for retry', async () => {
  const wrapper = render();
  api.onConfigure.mock.calls[0]![0](settings);
  await flushPromises();
  const panel = wrapper.getComponent(CaptureQuickSettingsPanel);
  expect(panel.props('showPreset')).toBe(false);
  api.update.mockRejectedValueOnce(new Error('Closed'));
  panel.vm.$emit('update:modelValue', { ...settings, countdownSeconds: 10 });
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('Closed');
  panel.vm.$emit('update:modelValue', { ...settings, countdownSeconds: 0 });
  await flushPromises();
  expect(panel.props('modelValue')).toEqual({ ...settings, countdownSeconds: 0 });
  expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  panel.vm.$emit('dismiss');
  expect(api.dismiss).toHaveBeenCalledOnce();
});
it('uses the same device choice menu, native presentation and teardown', async () => {
  const wrapper = render();
  api.onContent.mock.calls[0]![0]({
    visible: true,
    side: 'below',
    anchorX: 40,
    device: { kind: 'camera', position: { x: 20, y: 20 }, selectedId: 'off', options: [{ id: 'off', label: 'Off' }] },
  });
  await flushPromises();
  const choices = wrapper.getComponent(QuickSnipDeviceChoices);
  choices.vm.$emit('select', 'off');
  choices.vm.$emit('dismiss');
  expect(api.selectDevice).toHaveBeenCalledWith('off');
  expect(api.dismiss).toHaveBeenCalledOnce();
  expect(wrapper.get('.settings-shell').classes()).toContain('presented');
  wrapper.unmount();
  expect(api.off).toHaveBeenCalledTimes(2);
});
