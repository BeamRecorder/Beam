import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { capture, cameras, microphones, disconnect, unsubscribe, micMeter, systemMeter } = vi.hoisted(() => ({
  capture: {
    platform: 'linux',
    configureCameraOverlay: vi.fn(),
    onTeleprompterVisibility: vi.fn(),
    toggleRegionTeleprompter: vi.fn(),
  },
  cameras: vi.fn(),
  microphones: vi.fn(),
  disconnect: vi.fn(),
  unsubscribe: vi.fn(),
  micMeter: vi.fn(),
  systemMeter: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));
vi.mock('~/api/camera-recorder', () => ({ listBrowserCameras: cameras }));
vi.mock('~/api/microphone-recorder', () => ({ listBrowserMicrophones: microphones }));
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
vi.mock('../audio/useAudioLevelMeter', () => ({ useAudioLevelMeter: micMeter }));
vi.mock('../recorder/useNativeSystemAudioPreview', () => ({ useNativeSystemAudioPreview: systemMeter }));
import RegionRecordingToolbar from './RegionRecordingToolbar.vue';
import type { ScreenRegionOverlayOptions } from '~/api/types/screen-region';
const settings = {
  cameraId: 'off',
  microphoneId: 'no-audio',
  systemAudio: false,
  countdownSeconds: 3,
  hideTaskbar: false,
  hideDesktopIcons: false,
  showRealCursor: false,
};
const options: ScreenRegionOverlayOptions = {
  bounds: { x: -1000, y: 0, width: 1000, height: 800 },
  region: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
};
const Select = {
  props: ['modelValue', 'options', 'label'],
  emits: ['update:modelValue'],
  template: '<div><slot name="icon" /></div>',
};
const Button = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};
const QuickSettings = { props: ['modelValue'], emits: ['update:modelValue'], template: '<div />' };
let resized: ResizeObserverCallback;
let visibility: (value: boolean) => void;
beforeEach(() => {
  vi.clearAllMocks();
  capture.platform = 'linux';
  cameras.mockResolvedValue([{ id: 'camera', label: 'Camera' }]);
  microphones.mockResolvedValue([{ id: 'mic', label: 'Microphone' }]);
  capture.toggleRegionTeleprompter.mockResolvedValue(true);
  capture.onTeleprompterVisibility.mockImplementation((callback) => {
    visibility = callback;
    return unsubscribe;
  });
  micMeter.mockImplementation((enabled, id) => {
    expect(enabled.value).toBe(settings.microphoneId !== 'no-audio');
    expect(id.value).toBe(settings.microphoneId);
    return { level: 0.2 };
  });
  systemMeter.mockImplementation((enabled) => {
    expect(enabled.value).toBe(false);
    return { level: 0.4 };
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resized = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
const mountToolbar = (disabled = false, regionOptions = options) =>
  mount(RegionRecordingToolbar, {
    props: { modelValue: { ...settings }, disabled, regionOptions },
    global: { stubs: { Select, Button, RegionQuickSettings: QuickSettings, AudioIconMeter: true } },
  });
it('uses the existing device and audio paths, including explicit off choices', async () => {
  const wrapper = mountToolbar();
  await flushPromises();
  expect(wrapper.findAllComponents(Select).map((select) => select.props('options'))).toEqual([
    [
      { value: 'camera', label: 'Camera' },
      { value: 'off', label: 'cameraOff' },
    ],
    [
      { value: 'mic', label: 'Microphone' },
      { value: 'no-audio', label: 'noAudio' },
    ],
    [
      { value: 'on', label: 'systemAudio' },
      { value: 'off', label: 'off' },
    ],
  ]);
  const selects = wrapper.findAllComponents(Select);
  selects[0]!.vm.$emit('update:modelValue', 'camera');
  expect(capture.configureCameraOverlay).toHaveBeenCalledWith({ cameraId: 'camera' });
  selects[1]!.vm.$emit('update:modelValue', 'mic');
  selects[2]!.vm.$emit('update:modelValue', 'on');
  expect(wrapper.emitted('update:modelValue')).toEqual([
    [{ ...settings, cameraId: 'camera' }],
    [{ ...settings, cameraId: 'camera', microphoneId: 'mic' }],
    [{ ...settings, cameraId: 'camera', microphoneId: 'mic', systemAudio: true }],
  ]);
  selects[2]!.vm.$emit('update:modelValue', 'off');
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
    { ...settings, cameraId: 'camera', microphoneId: 'mic' },
  ]);
  wrapper.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
it('reports actual toolbar dimensions and emits cancel and record', async () => {
  const wrapper = mountToolbar();
  await flushPromises();
  Object.defineProperties(wrapper.element, { offsetWidth: { value: 710 }, offsetHeight: { value: 58 } });
  resized([], {} as ResizeObserver);
  expect(wrapper.emitted('resize')).toEqual([[710, 58]]);
  const buttons = wrapper.findAll('button');
  await buttons[0]!.trigger('click');
  await buttons[2]!.trigger('click');
  expect(wrapper.emitted('cancel')).toHaveLength(1);
  expect(wrapper.emitted('record')).toHaveLength(1);
  wrapper.unmount();
});
it('keeps Record disabled for a zero area crop', async () => {
  const wrapper = mountToolbar(true);
  await wrapper.findAll('button')[2]!.trigger('click');
  expect(wrapper.emitted('record')).toBeUndefined();
  wrapper.unmount();
  await flushPromises();
});
it.each([
  [0, 0],
  [0, 58],
  [710, 0],
])('does not replace the visible size with a hidden measurement %s × %s', async (width, height) => {
  const wrapper = mountToolbar();
  await flushPromises();
  Object.defineProperties(wrapper.element, {
    offsetWidth: { configurable: true, value: 710 },
    offsetHeight: { configurable: true, value: 58 },
  });
  resized([], {} as ResizeObserver);
  Object.defineProperties(wrapper.element, {
    offsetWidth: { configurable: true, value: width },
    offsetHeight: { configurable: true, value: height },
  });
  resized([], {} as ResizeObserver);
  expect(wrapper.emitted('resize')).toEqual([[710, 58]]);
  wrapper.unmount();
});
it('opens the teleprompter with current plain crop bounds and follows native visibility', async () => {
  const wrapper = mountToolbar();
  await flushPromises();
  await wrapper.findAll('button')[1]!.trigger('click');
  await flushPromises();
  expect(capture.toggleRegionTeleprompter).toHaveBeenCalledWith(options);
  visibility(true);
  await wrapper.vm.$nextTick();
  expect(wrapper.findAll('button')[1]!.attributes('aria-pressed')).toBe('true');
  wrapper.unmount();
});
it('surfaces teleprompter placement failure, including absent crop data', async () => {
  capture.toggleRegionTeleprompter.mockRejectedValue(new Error('No room outside crop'));
  const wrapper = mountToolbar(false, { bounds: options.bounds });
  await wrapper.findAll('button')[1]!.trigger('click');
  await flushPromises();
  expect(capture.toggleRegionTeleprompter).toHaveBeenCalledWith({ bounds: options.bounds, region: null });
  expect(wrapper.get('[role="alert"]').text()).toContain('No room outside crop');
  wrapper.unmount();
});
it('retains independently available devices and exposes enumeration failures', async () => {
  cameras.mockRejectedValue(new Error('Camera unavailable'));
  microphones.mockResolvedValue([]);
  const wrapper = mountToolbar();
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('Camera unavailable');
  expect(wrapper.findAllComponents(Select)[1]!.props('options')).toEqual([{ value: 'no-audio', label: 'noAudio' }]);
  wrapper.unmount();
});
it('does not revive the toolbar after delayed device enumeration completes', async () => {
  let resolve!: (value: never[]) => void;
  cameras.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const wrapper = mountToolbar();
  wrapper.unmount();
  resolve([]);
  await flushPromises();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(disconnect).toHaveBeenCalledOnce();
});
it('does not start native audio preview on other operating systems', async () => {
  capture.platform = 'darwin';
  const wrapper = mountToolbar();
  await flushPromises();
  expect(systemMeter).toHaveBeenCalledOnce();
  wrapper.unmount();
});
it('applies quick settings and recomputes enabled camera and audio presentation', async () => {
  const wrapper = mountToolbar();
  await flushPromises();
  const next = { ...settings, cameraId: 'camera', microphoneId: 'mic', systemAudio: true, countdownSeconds: 6 };
  wrapper.findComponent(QuickSettings).vm.$emit('update:modelValue', next);
  await wrapper.vm.$nextTick();
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([next]);
  await wrapper.setProps({ modelValue: next });
  expect(wrapper.findAllComponents(Select).map((select) => select.props('modelValue'))).toEqual([
    'camera',
    'mic',
    'on',
  ]);
  wrapper.unmount();
});
