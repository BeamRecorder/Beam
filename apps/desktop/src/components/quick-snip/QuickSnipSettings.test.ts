import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { QuickSnipConfiguration } from '~/api/types/quick-snip';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import type { QuickSnipSettingsContent } from '~/api/types/quick-snip-settings';
import type { RegionRecordingSettings } from '~/api/types/screen-region';
const bridge = vi.hoisted(() => ({
  listener: null as ((value: QuickSnipConfiguration) => void) | null,
  contentListener: null as ((value: QuickSnipSettingsContent) => void) | null,
  capture: {
    onQuickSnipConfigure: vi.fn(),
    onQuickSnipSettingsContent: vi.fn<(listener: (value: QuickSnipSettingsContent) => void) => () => void>(
      () => () => {},
    ),
    selectQuickSnipDevice: vi.fn(),
    notifyQuickSnipSettingsReady: vi.fn(),
    getEditorPresets: vi.fn(),
    selectEditorPreset: vi.fn(),
    configureQuickSnip: vi.fn(),
    dismissQuickSnipSettings: vi.fn(),
    fitQuickSnipSettings: vi.fn(),
  },
  off: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture: bridge.capture }));
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
import QuickSnipSettings from './QuickSnipSettings.vue';
import CaptureQuickSettingsPanel from '../hud/region/CaptureQuickSettingsPanel.vue';
enableAutoUnmount(afterEach);
const preset = {
  id: 'default',
  name: 'Default',
  protected: true,
  updatedAt: '',
  settings: {
    editor: { schemaVersion: 1 as const },
    devices: {},
    export: { format: 'mp4' as const },
    quickSnip: { automaticZoom: true },
  },
};
const configuration = (mode: 'studio' | 'screenshot' = 'studio'): QuickSnipConfiguration => ({
  mode,
  format: 'mp4',
  name: 'job',
  preset,
  devices: {},
  automaticZoom: true,
  displayId: '1',
  screenKind: 'display',
  region: null,
  regionBounds: { x: 0, y: 0, width: 1920, height: 1080 },
  zoomMode: '3d',
});
const document: EditorPresetDocument = { schemaVersion: 1, activePresetId: 'default', presets: [preset] };
const mountSettings = async () => {
  const wrapper = mount(QuickSnipSettings, { global: { stubs: { CaptureQuickSettingsPanel: true } } });
  bridge.listener?.(configuration());
  await flushPromises();
  return { wrapper, panel: wrapper.getComponent(CaptureQuickSettingsPanel) };
};
beforeEach(() => {
  vi.resetAllMocks();
  bridge.capture.onQuickSnipSettingsContent.mockImplementation((listener) => {
    bridge.contentListener = listener;
    return () => {};
  });
  bridge.capture.onQuickSnipConfigure.mockImplementation((listener) => {
    bridge.listener = listener;
    return bridge.off;
  });
  bridge.capture.getEditorPresets.mockResolvedValue(document);
  bridge.capture.selectEditorPreset.mockResolvedValue(document);
  bridge.capture.configureQuickSnip.mockResolvedValue({ state: 'selecting' });
});
it('subscribes before declaring readiness and shares settings with presets enabled', async () => {
  const { panel } = await mountSettings();
  expect(bridge.capture.onQuickSnipConfigure.mock.invocationCallOrder[0]).toBeLessThan(
    bridge.capture.notifyQuickSnipSettingsReady.mock.invocationCallOrder[0],
  );
  expect(panel.props('showPreset')).toBe(true);
  expect(panel.props('modelValue')).toMatchObject({ zoomMode: '3d', countdownSeconds: 3 });
  expect(panel.props('presets')).toEqual([{ value: 'default', label: 'defaultPreset' }]);
});
it.each(['off', '2d', '3d', 'glass'] as const)(
  'persists %s and desktop/countdown options through the owned IPC',
  async (zoomMode) => {
    const { panel } = await mountSettings();
    panel.vm.$emit('update:modelValue', {
      ...(panel.props('modelValue') as RegionRecordingSettings),
      zoomMode,
      countdownSeconds: 10,
      hideTaskbar: true,
    });
    await flushPromises();
    expect(bridge.capture.configureQuickSnip).toHaveBeenCalledWith({
      zoomMode,
      countdownSeconds: 10,
      hideTaskbar: true,
      hideDesktopIcons: false,
      showRealCursor: false,
    });
  },
);
it.each(['studio', 'screenshot'] as const)(
  'loads and selects the real %s preset collection without changing zoom preference',
  async (mode) => {
    const { panel } = await mountSettings();
    bridge.listener?.(configuration(mode));
    await flushPromises();
    panel.vm.$emit('preset', 'default');
    await flushPromises();
    expect(bridge.capture.getEditorPresets).toHaveBeenLastCalledWith(mode === 'screenshot' ? 'screenshot' : 'video');
    expect(bridge.capture.selectEditorPreset).toHaveBeenCalledWith(
      'default',
      mode === 'screenshot' ? 'screenshot' : 'video',
    );
    expect(bridge.capture.configureQuickSnip).toHaveBeenLastCalledWith({});
    expect((panel.props('modelValue') as RegionRecordingSettings).zoomMode).toBe('3d');
  },
);
it('keeps empty preset data empty and ignores an obsolete video list after switching to Image', async () => {
  const { panel } = await mountSettings();
  let finish!: (value: EditorPresetDocument) => void;
  bridge.capture.getEditorPresets.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  bridge.listener?.(configuration());
  bridge.capture.getEditorPresets.mockResolvedValueOnce({ ...document, presets: [] });
  bridge.listener?.(configuration('screenshot'));
  await flushPromises();
  finish(document);
  await flushPromises();
  expect(panel.props('presets')).toEqual([]);
  expect(panel.props('screenshot')).toBe(true);
});
it.each(['getEditorPresets', 'selectEditorPreset', 'configureQuickSnip'] as const)(
  'shows %s failures and releases pending settings',
  async (method) => {
    const { wrapper, panel } = await mountSettings();
    bridge.capture[method].mockRejectedValueOnce(new Error('storage unavailable'));
    if (method === 'getEditorPresets') bridge.listener?.(configuration());
    else if (method === 'selectEditorPreset') panel.vm.$emit('preset', 'default');
    else panel.vm.$emit('update:modelValue', panel.props('modelValue'));
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('storage unavailable');
    expect(panel.props('disabled')).toBe(false);
  },
);
it('routes panel dismissal and unsubscribes when the renderer is disposed', async () => {
  const { wrapper, panel } = await mountSettings();
  panel.vm.$emit('dismiss');
  expect(bridge.capture.dismissQuickSnipSettings).toHaveBeenCalledOnce();
  wrapper.unmount();
  expect(bridge.off).toHaveBeenCalledOnce();
});
it('opens and closes its shell from the actual trigger side without changing its content', async () => {
  const { wrapper } = await mountSettings();
  expect(wrapper.classes()).not.toContain('presented');
  bridge.contentListener?.({ side: 'above', anchorX: 240, device: null, visible: true });
  await flushPromises();
  expect(wrapper.classes()).toContain('presented');
  expect(wrapper.attributes('style')).toContain('--anchor-x: 240px');
  bridge.contentListener?.({ side: 'below', anchorX: 40, device: null, visible: false });
  await flushPromises();
  expect(wrapper.classes()).not.toContain('presented');
  expect(wrapper.classes()).toContain('below');
  expect(wrapper.findComponent(CaptureQuickSettingsPanel).exists()).toBe(true);
});
it.each(['microphone', 'camera', 'systemAudio'] as const)(
  'uses the shared choice surface for %s and restores settings afterward',
  async (kind) => {
    const { wrapper } = await mountSettings();
    const device = {
      kind,
      selectedId: 'on',
      position: { x: 240, y: 32 },
      options: [
        { id: 'off', label: 'Off' },
        { id: 'on', label: 'Device' },
      ],
    };
    bridge.contentListener?.({ side: 'above', anchorX: 240, device, visible: true });
    await flushPromises();
    expect(wrapper.classes()).toContain('device-popover');
    expect(wrapper.get('main').classes()).toContain('floating-surface');
    expect(wrapper.findComponent(CaptureQuickSettingsPanel).exists()).toBe(false);
    await wrapper.get('[aria-checked="false"]').trigger('click');
    expect(bridge.capture.selectQuickSnipDevice).toHaveBeenCalledWith('off');
    await wrapper.get('[aria-checked="true"]').trigger('keydown', { key: 'Escape' });
    expect(bridge.capture.dismissQuickSnipSettings).toHaveBeenCalledOnce();
    bridge.contentListener?.({ side: 'below', anchorX: 40, device: null, visible: true });
    await flushPromises();
    expect(wrapper.classes()).not.toContain('device-popover');
    expect(wrapper.get('main').classes()).not.toContain('floating-surface');
    expect(wrapper.findComponent(CaptureQuickSettingsPanel).exists()).toBe(true);
  },
);
it('reports the full menu content height including its border to the native window', async () => {
  const { wrapper } = await mountSettings();
  Object.defineProperties(wrapper.get('main').element, {
    offsetHeight: { value: 180 },
    clientHeight: { value: 178 },
    scrollHeight: { value: 312 },
  });
  bridge.contentListener?.({ side: 'above', anchorX: 240, device: null, visible: true });
  await flushPromises();
  expect(bridge.capture.fitQuickSnipSettings).toHaveBeenLastCalledWith(314);
});
it('keeps development preview choices local without requesting a native menu or changing user settings', async () => {
  window.history.replaceState(null, '', '/?preview=1');
  vi.resetModules();
  try {
    const { default: PreviewSettings } = await import('./QuickSnipSettings.vue');
    const wrapper = mount(PreviewSettings, { global: { stubs: { CaptureQuickSettingsPanel: true } } });
    await flushPromises();
    const panel = wrapper.getComponent({ name: 'CaptureQuickSettingsPanel' });
    expect(wrapper.classes()).toContain('preview');
    expect(panel.props('presets')).toHaveLength(10);
    expect(bridge.capture.onQuickSnipSettingsContent).not.toHaveBeenCalled();
    panel.vm.$emit('update:modelValue', { ...panel.props('modelValue'), zoomMode: '3d' });
    panel.vm.$emit('preset', 'demo-4');
    panel.vm.$emit('dismiss');
    await flushPromises();
    expect(panel.props('presetId')).toBe('demo-4');
    expect(bridge.capture.configureQuickSnip).not.toHaveBeenCalled();
    expect(bridge.capture.selectEditorPreset).not.toHaveBeenCalled();
    expect(bridge.capture.fitQuickSnipSettings).not.toHaveBeenCalled();
    expect(bridge.capture.dismissQuickSnipSettings).not.toHaveBeenCalled();
    wrapper.unmount();
  } finally {
    window.history.replaceState(null, '', '/');
  }
});
