import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PreparationDeviceSelect from './PreparationDeviceSelect.vue';
import CapturePreparationBar from './CapturePreparationBar.vue';
import type * as CoreModule from '@vueuse/core';
const mocks = vi.hoisted(() => ({
  capture: {
    platform: 'linux',
    preparation: {
      fitBar: vi.fn().mockResolvedValue(682),
      configure: vi.fn(),
      toggleSettings: vi.fn(),
      dismiss: vi.fn(),
      onSettingsVisibility: vi.fn<(listener: (visible: boolean) => void) => () => void>().mockReturnValue(() => {}),
    },
    configureCameraOverlay: vi.fn(),
    toggleTeleprompterVisibility: vi.fn(),
    onTeleprompterVisibility: vi.fn<(listener: (visible: boolean) => void) => () => void>().mockReturnValue(() => {}),
  },
  measure: () => {},
  cameras: vi.fn(),
  microphones: vi.fn(),
}));
vi.mock('@vueuse/core', async (original) => ({
  ...(await original<typeof CoreModule>()),
  useResizeObserver: (_target: unknown, callback: () => void) => {
    mocks.measure = callback;
  },
}));
vi.mock('~/api/capture', () => ({ capture: mocks.capture }));
vi.mock('~/api/camera-recorder', () => ({ listBrowserCameras: mocks.cameras }));
vi.mock('~/api/microphone-recorder', () => ({ listBrowserMicrophones: mocks.microphones }));
vi.mock('../audio/useAudioLevelMeter', async () => {
  const { watchEffect } = await import('vue');
  return {
    useAudioLevelMeter: (enabled: { value: boolean }, id: { value: string }) => {
      watchEffect(() => {
        void enabled.value;
        void id.value;
      });
      return { level: 0 };
    },
  };
});
vi.mock('./useNativeSystemAudioPreview', async () => {
  const { watchEffect } = await import('vue');
  return {
    useNativeSystemAudioPreview: (enabled: { value: boolean }) => {
      watchEffect(() => {
        void enabled.value;
      });
      return { level: 0 };
    },
  };
});

let wrapper: VueWrapper;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cameras.mockResolvedValue([{ id: 'cam', label: 'Camera' }]);
  mocks.microphones.mockResolvedValue([{ id: 'mic', label: 'Microphone' }]);
});
const request = (countdownSeconds: number) => ({
  settings: {
    cameraId: 'off',
    microphoneId: 'no-audio',
    systemAudio: false,
    countdownSeconds,
    hideTaskbar: false,
    hideDesktopIcons: false,
    showRealCursor: false,
  },
});
const render = (countdownSeconds = 3, busy = false) =>
  (wrapper = mount(CapturePreparationBar, {
    attachTo: document.body,
    props: { request: request(countdownSeconds), busy },
    global: { stubs: { PreparationDeviceSelect: true } },
  }));
const key = (name: string, options: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...options }));
afterEach(() => wrapper.unmount());
describe('preparation controls', () => {
  it('shows full preparation controls and countdown without an elapsed recording timer', () => {
    render();
    expect(wrapper.findAllComponents(PreparationDeviceSelect)).toHaveLength(3);
    expect(wrapper.text()).toContain('3s');
    expect(wrapper.text()).not.toContain('00:00');
    expect(wrapper.get('aside').classes()).toContain('opaque');
  });
  it('shows Off without starting automatically', () => {
    render(0);
    expect(wrapper.text()).toContain('Off');
    expect(wrapper.emitted('record')).toBeUndefined();
  });
  it('starts and cancels through the labelled controls', async () => {
    render();
    await wrapper.get('button:not([aria-label])').trigger('click');
    await wrapper.get('[aria-label="Cancel"]').trigger('click');
    expect(wrapper.emitted('record')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });
  it('supports Enter and Escape in its focused document', () => {
    render();
    key('Enter');
    key('Escape');
    expect(wrapper.emitted('record')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });
  it.each([
    { repeat: true },
    { isComposing: true },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
  ])('ignores held, composed and modified keys: %s', (options) => {
    render();
    key('Enter', options);
    key('Escape', options);
    expect(wrapper.emitted('record')).toBeUndefined();
    expect(wrapper.emitted('cancel')).toBeUndefined();
  });
  it('preserves native Enter activation on a focused cancel button', () => {
    render();
    wrapper
      .get('[aria-label="Cancel"]')
      .element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(wrapper.emitted('record')).toBeUndefined();
  });
  it('leaves handled and unrelated keys alone', () => {
    render();
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    event.preventDefault();
    window.dispatchEvent(event);
    key('a');
    expect(wrapper.emitted('record')).toBeUndefined();
    expect(wrapper.emitted('cancel')).toBeUndefined();
  });
  it('prevents duplicate actions during native handoff', async () => {
    render(3, true);
    key('Enter');
    key('Escape');
    for (const button of wrapper.findAll('button')) {
      expect(button.attributes('disabled')).toBeDefined();
      await button.trigger('click');
    }
    expect(wrapper.emitted('record')).toBeUndefined();
    expect(wrapper.emitted('cancel')).toBeUndefined();
  });
  it('removes document keyboard handling when leaving preparation', () => {
    render();
    wrapper.unmount();
    key('Enter');
    key('Escape');
    expect(wrapper.emitted('record')).toBeUndefined();
    expect(wrapper.emitted('cancel')).toBeUndefined();
  });
});
it('changes all three devices, configures the live camera and retains other settings', async () => {
  render();
  await flushPromises();
  const selects = wrapper.findAllComponents(PreparationDeviceSelect);
  expect(selects[0]!.props('options')).toContainEqual({ value: 'cam', label: 'Camera' });
  expect(selects[1]!.props('options')).toContainEqual({ value: 'mic', label: 'Microphone' });
  selects[0]!.vm.$emit('select', 'cam');
  selects[1]!.vm.$emit('select', 'mic');
  selects[2]!.vm.$emit('select', 'on');
  selects[2]!.vm.$emit('select', 'off');
  expect(wrapper.emitted('update:settings')).toEqual([
    [{ ...request(3).settings, cameraId: 'cam' }],
    [{ ...request(3).settings, microphoneId: 'mic' }],
    [{ ...request(3).settings, systemAudio: true }],
    [{ ...request(3).settings, systemAudio: false }],
  ]);
  expect(mocks.capture.configureCameraOverlay).toHaveBeenCalledWith({ cameraId: 'cam' });
  selects[0]!.vm.$emit('error', 'Device unavailable');
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('Device unavailable');
});
it('anchors settings to the cog and reflects native menu and teleprompter visibility', async () => {
  render();
  await flushPromises();
  const cog = wrapper.get('[data-preparation-settings]');
  await cog.trigger('click');
  await flushPromises();
  expect(mocks.capture.preparation.configure).toHaveBeenCalledWith(request(3).settings);
  expect(mocks.capture.preparation.toggleSettings).toHaveBeenCalledWith({ x: 0, y: 0, width: 0, height: 0 });
  mocks.capture.preparation.onSettingsVisibility.mock.calls.at(-1)![0](true);
  mocks.capture.onTeleprompterVisibility.mock.calls.at(-1)![0](true);
  await flushPromises();
  expect(cog.attributes('aria-expanded')).toBe('true');
  expect(wrapper.get('[aria-label="Teleprompter"]').attributes('aria-pressed')).toBe('true');
  await wrapper.get('[aria-label="Teleprompter"]').trigger('click');
  expect(mocks.capture.toggleTeleprompterVisibility).toHaveBeenCalledOnce();
  await cog.trigger('pointerdown');
  expect(mocks.capture.preparation.dismiss).not.toHaveBeenCalled();
  await wrapper.get('aside').trigger('pointerdown');
  expect(mocks.capture.preparation.dismiss).toHaveBeenCalledOnce();
});
it('reports settings failure and disables every device during handoff', async () => {
  mocks.capture.preparation.configure.mockRejectedValueOnce(new Error('Settings closed'));
  render();
  await wrapper.get('[data-preparation-settings]').trigger('click');
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('Settings closed');
  await wrapper.setProps({ busy: true });
  wrapper.findComponent(PreparationDeviceSelect).vm.$emit('select', 'cam');
  expect(wrapper.emitted('update:settings')).toBeUndefined();
});
it('retains independent device results and surfaces failed enumeration', async () => {
  mocks.cameras.mockRejectedValueOnce(new Error('Permission denied'));
  render();
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('Permission denied');
  expect(wrapper.findAllComponents(PreparationDeviceSelect)[1]!.props('options')).toHaveLength(2);
});
it('ignores discovery results after disposal', async () => {
  let resolve!: (value: never[]) => void;
  mocks.cameras.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render();
  wrapper.unmount();
  resolve([]);
  await flushPromises();
  expect(wrapper.emitted('update:settings')).toBeUndefined();
});
it('updates camera, microphone and audio presentation with changed settings across platforms', async () => {
  mocks.capture.platform = 'win32';
  render();
  await flushPromises();
  await wrapper.setProps({
    request: { settings: { ...request(7).settings, cameraId: 'cam', microphoneId: 'mic', systemAudio: true } },
  });
  expect(wrapper.get('aside').classes()).not.toContain('opaque');
  expect(wrapper.text()).toContain('7s');
  const devices = wrapper.findAllComponents(PreparationDeviceSelect);
  expect(devices.map((device) => device.props('value'))).toEqual(['cam', 'mic', 'on']);
  devices[1]!.vm.$emit('error', 'Microphone error');
  devices[2]!.vm.$emit('error', 'Audio error');
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('Audio error');
  mocks.capture.platform = 'linux';
});
it('does not invoke device or settings actions from stale UI events during handoff', async () => {
  render(3, true);
  await flushPromises();
  const Button = (await import('~/ui/button/Button.vue')).default;
  const buttons = wrapper.findAllComponents(Button);
  buttons
    .find((button) => button.find('button').attributes('aria-label') === 'Teleprompter')!
    .vm.$emit('click', new MouseEvent('click'));
  buttons
    .find((button) => button.find('button').attributes('data-preparation-settings') !== undefined)!
    .vm.$emit('click', new MouseEvent('click'));
  expect(mocks.capture.toggleTeleprompterVisibility).not.toHaveBeenCalled();
  expect(mocks.capture.preparation.toggleSettings).not.toHaveBeenCalled();
});
it('dismisses settings for text-node hits and suppresses the browser context menu', async () => {
  render();
  const text = document.createTextNode('grip');
  wrapper.get('aside').element.append(text);
  text.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(mocks.capture.preparation.dismiss).toHaveBeenCalledOnce();
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  wrapper.get('aside').element.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});
it('sizes the native bar to actual content and ignores hidden or handing-off measurements', async () => {
  render();
  await flushPromises();
  expect(mocks.capture.preparation.fitBar).not.toHaveBeenCalled();
  Object.defineProperty(wrapper.element, 'offsetWidth', { configurable: true, value: 650 });
  mocks.measure();
  await flushPromises();
  expect(mocks.capture.preparation.fitBar).toHaveBeenCalledExactlyOnceWith(650);
  await wrapper.setProps({ busy: true });
  mocks.measure();
  expect(mocks.capture.preparation.fitBar).toHaveBeenCalledTimes(1);
});
it('surfaces a native layout failure while keeping the preparation controls available', async () => {
  render();
  await flushPromises();
  Object.defineProperty(wrapper.element, 'offsetWidth', { value: 650 });
  mocks.capture.preparation.fitBar.mockRejectedValueOnce(new Error('Window unavailable'));
  mocks.measure();
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('Window unavailable');
  expect(wrapper.get('[data-preparation-record]').attributes('disabled')).toBeUndefined();
});
it('uses explicit Off labels matching the HUD', async () => {
  render();
  await flushPromises();
  const devices = wrapper.findAllComponents(PreparationDeviceSelect);
  expect(devices[1]!.props('options')).toContainEqual({ value: 'no-audio', label: 'No microphone' });
  expect(devices[2]!.props('options')).toContainEqual({ value: 'off', label: 'No system audio' });
});
