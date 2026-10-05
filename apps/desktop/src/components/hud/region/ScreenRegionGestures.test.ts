import { triggerPointer } from '../../../../../../tests/support/pointer';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ScreenRegionOverlayOptions } from '~/api/types/screen-region';
import RegionRecordingToolbar from './RegionRecordingToolbar.vue';
const { capture } = vi.hoisted(() => ({
  capture: {
    platform: 'linux',
    notifyScreenRegionReady: vi.fn(),
    onScreenRegionConfigure: vi.fn(),
    onPreferenceShortcut: vi.fn((_listener: (id: string) => void) => vi.fn()),
    confirmScreenRegion: vi.fn(),
    cancelScreenRegion: vi.fn(),
    updateScreenRegion: vi.fn(),
    updateTeleprompterRegion: vi.fn(),
    configureCameraOverlay: vi.fn(),
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
  },
}));
vi.mock('~/api/capture', () => ({ capture }));
vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({ t: (key: string) => key }),
}));
import ScreenRegionOverlayApp from './ScreenRegionOverlayApp.vue';
import RegionDimensions from './RegionDimensions.vue';
const crop = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };
const recording = {
  cameraId: 'off',
  microphoneId: 'no-audio',
  systemAudio: false,
  countdownSeconds: 3,
  hideTaskbar: false,
  hideDesktopIcons: false,
  showRealCursor: false,
};
const Select = {
  name: 'Select',
  props: ['options', 'modelValue'],
  emits: ['update:modelValue'],
  template: '<select />',
};
const toolbar = {
  props: ['modelValue'],
  emits: ['record', 'cancel', 'resize'],
  template: '<aside class="region-recording-toolbar" />',
};
let resizedTop: ResizeObserverCallback;
beforeEach(() => {
  vi.clearAllMocks();
  capture.getPreferences.mockResolvedValue({ extras: {} });
  capture.updatePreferences.mockResolvedValue({});
  capture.updateTeleprompterRegion.mockResolvedValue(undefined);
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: 1000 },
    innerHeight: { configurable: true, value: 500 },
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resizedTop = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
async function setup(region = crop, extra: Partial<ScreenRegionOverlayOptions> = {}) {
  let configure!: (options: ScreenRegionOverlayOptions & { mode: string }) => void;
  capture.onScreenRegionConfigure.mockImplementation((callback) => {
    configure = callback;
    return vi.fn();
  });
  const wrapper = mount(ScreenRegionOverlayApp, {
    global: {
      stubs: {
        RegionRecordingToolbar: toolbar,
        Button: {
          props: ['disabled'],
          template: '<button :disabled="disabled"><slot /></button>',
        },
        Select,
      },
    },
  });
  configure({
    mode: 'select',
    bounds: { x: -1000, y: 0, width: 1000, height: 500 },
    region,
    ...extra,
  });
  await flushPromises();
  const main = wrapper.get('main');
  Object.defineProperty(main.element, 'setPointerCapture', { value: vi.fn() });
  return { wrapper, main, configure };
}
it('ignores a simple click and pointer jitter instead of replacing the selected crop', async () => {
  const { wrapper, main } = await setup();
  const original = wrapper.get('.region-frame').attributes('style');
  await triggerPointer(main, 'pointerdown', {
    button: 0,
    clientX: 50,
    clientY: 50,
    pointerId: 1,
  });
  await triggerPointer(main, 'pointermove', {
    clientX: 53,
    clientY: 52,
    pointerId: 1,
  });
  await triggerPointer(main, 'pointerup');
  expect(wrapper.get('.region-frame').attributes('style')).toBe(original);
  expect((wrapper.get('.region-preset-picker').element as HTMLElement).style.display).not.toBe('none');
  wrapper.unmount();
});
it('recording shortcut confirms the visible restored crop with the toolbar settings and releases its subscription', async () => {
  const { wrapper } = await setup(crop, { recording });
  const shortcut = capture.onPreferenceShortcut.mock.calls[0]![0] as (id: string) => void;
  shortcut('editor.play');
  expect(capture.confirmScreenRegion).not.toHaveBeenCalled();
  const edited = { ...recording, countdownSeconds: 0 };
  wrapper.getComponent(RegionRecordingToolbar).vm.$emit('update:modelValue', edited);
  await wrapper.vm.$nextTick();
  shortcut('hud.startStopRecording');
  expect(capture.confirmScreenRegion).toHaveBeenCalledWith(crop, edited);
  wrapper.unmount();
  expect(capture.onPreferenceShortcut.mock.results[0]!.value).toHaveBeenCalledOnce();
});
it('recording shortcut does not confirm an unfinished gesture or a recording marker', async () => {
  const { wrapper, main, configure } = await setup();
  const shortcut = capture.onPreferenceShortcut.mock.calls[0]![0] as (id: string) => void;
  await triggerPointer(main, 'pointerdown', { clientX: 300, clientY: 150, pointerId: 1 });
  shortcut('hud.startStopRecording');
  expect(capture.confirmScreenRegion).not.toHaveBeenCalled();
  await triggerPointer(main, 'pointerup');
  configure({ mode: 'record', bounds: { x: 0, y: 0, width: 1280, height: 720 }, region: crop });
  await wrapper.vm.$nextTick();
  shortcut('hud.startStopRecording');
  expect(capture.confirmScreenRegion).not.toHaveBeenCalled();
  wrapper.unmount();
});
it('displays a saved region in logical coordinates with physical 150% dimensions and notifies its native owner', async () => {
  const { wrapper } = await setup(crop, {
    bounds: { x: 0, y: 0, width: 1280, height: 720 },
    pixelSize: { width: 1920, height: 1080 },
  });
  expect(wrapper.get('.region-frame').attributes('style')).toContain('width: 40%');
  expect(wrapper.get('.region-size').attributes('aria-label')).toBe('768 × 432');
  expect(capture.updateScreenRegion).toHaveBeenCalledWith(crop);
  wrapper.unmount();
});
it('keeps the restored selection visible and reports failure to position the teleprompter', async () => {
  capture.updateTeleprompterRegion.mockRejectedValueOnce(new Error('Teleprompter unavailable'));
  const { wrapper } = await setup(crop, { recording });
  expect(wrapper.get('.region-frame').isVisible()).toBe(true);
  expect(wrapper.get('[role="alert"]').text()).toContain('Teleprompter unavailable');
  expect(capture.updateScreenRegion).toHaveBeenCalledWith(crop);
  wrapper.unmount();
});
it('keeps dimensions live and aligned while presets and the recording bar are hidden during deliberate drawing', async () => {
  const { wrapper, main } = await setup(crop, {
    recording,
    preview: 'data:image/png;base64,preview',
    pixelSize: { width: 2000, height: 1000 },
  });
  await triggerPointer(main, 'pointerdown', {
    button: 0,
    clientX: 50,
    clientY: 50,
    pointerId: 1,
  });
  await triggerPointer(main, 'pointermove', {
    clientX: 550,
    clientY: 300,
    pointerId: 1,
  });
  expect(wrapper.get('.region-size').attributes('aria-label')).toBe('1000 × 500');
  expect(wrapper.findComponent(RegionDimensions).props('live')).toBe(true);
  expect(wrapper.get('.region-preset-picker').isVisible()).toBe(false);
  expect(wrapper.get('.region-recording-toolbar').isVisible()).toBe(false);
  expect(wrapper.find('.region-magnifier').exists()).toBe(true);
  await triggerPointer(main, 'pointerup');
  expect((wrapper.get('.region-preset-picker').element as HTMLElement).style.display).not.toBe('none');
  expect((wrapper.get('.region-recording-toolbar').element as HTMLElement).style.display).not.toBe('none');
  expect(wrapper.find('.region-magnifier').exists()).toBe(false);
  wrapper.findComponent(toolbar).vm.$emit('record');
  expect(capture.confirmScreenRegion).toHaveBeenCalledWith({ x: 0.05, y: 0.1, width: 0.5, height: 0.5 }, recording);
  wrapper.unmount();
});
it('allows an intentionally drawn small region after the drag threshold', async () => {
  const { wrapper, main } = await setup();
  await triggerPointer(main, 'pointerdown', {
    button: 0,
    clientX: 50,
    clientY: 50,
    pointerId: 1,
  });
  await triggerPointer(main, 'pointermove', {
    clientX: 60,
    clientY: 60,
    pointerId: 1,
  });
  await triggerPointer(main, 'pointerup');
  expect(wrapper.get('.region-size').attributes('aria-label')).toBe('10 × 10');
  wrapper.unmount();
});
it.each([
  [950, 450, 800, 350, '274px', 'bottom', '62px'],
  [950, 350, 800, 250, '274px', 'top', '362px'],
  [30, 450, 100, 350, '30px', 'bottom', '62px'],
] as const)(
  'positions the spring at its final screen edge before controls reappear',
  async (startX, startY, endX, endY, left, edge, position) => {
    const { wrapper, main } = await setup(crop, { recording });
    wrapper.findComponent(toolbar).vm.$emit('resize', 710, 54);
    await triggerPointer(main, 'pointerdown', {
      button: 0,
      clientX: startX,
      clientY: startY,
      pointerId: 1,
    });
    await triggerPointer(main, 'pointermove', {
      clientX: endX,
      clientY: endY,
      pointerId: 1,
    });
    const element = wrapper.get('.region-recording-toolbar').element as HTMLElement;
    expect(element.style.left).toBe(left);
    expect(element.style[edge]).toBe(position);
    await triggerPointer(main, 'pointerup');
    expect(element.style.left).toBe(left);
    expect(element.style[edge]).toBe(position);
    wrapper.unmount();
  },
);
it('restores the previous crop after a zero height stroke and ignores right clicks', async () => {
  const { wrapper, main } = await setup();
  const original = wrapper.get('.region-frame').attributes('style');
  await triggerPointer(main, 'pointerdown', {
    button: 2,
    clientX: 50,
    clientY: 50,
    pointerId: 1,
  });
  await triggerPointer(main, 'pointermove', {
    clientX: 300,
    clientY: 50,
    pointerId: 1,
  });
  expect(wrapper.get('.region-frame').attributes('style')).toBe(original);
  await triggerPointer(main, 'pointerdown', {
    button: 0,
    clientX: 50,
    clientY: 50,
    pointerId: 1,
  });
  await triggerPointer(main, 'pointermove', {
    clientX: 300,
    clientY: 50,
    pointerId: 1,
  });
  await triggerPointer(main, 'pointerup');
  expect(wrapper.get('.region-frame').attributes('style')).toBe(original);
  wrapper.unmount();
});
it('hides controls during move and resize and restores them on pointer cancellation', async () => {
  const { wrapper, main } = await setup();
  await triggerPointer(wrapper.get('.region-frame'), 'pointerdown', {
    button: 0,
    clientX: 250,
    clientY: 150,
    pointerId: 1,
  });
  await triggerPointer(main, 'pointermove', {
    clientX: 350,
    clientY: 150,
    pointerId: 1,
  });
  expect(wrapper.get('.region-toolbar').isVisible()).toBe(false);
  await triggerPointer(main, 'pointerup');
  await triggerPointer(wrapper.get('.resize-handle.nw'), 'pointerdown', {
    button: 0,
    clientX: 300,
    clientY: 100,
    pointerId: 2,
  });
  await triggerPointer(main, 'pointermove', {
    clientX: 200,
    clientY: 50,
    pointerId: 2,
  });
  expect(wrapper.get('.region-preset-picker').isVisible()).toBe(false);
  await triggerPointer(main, 'pointercancel');
  expect((wrapper.get('.region-toolbar').element as HTMLElement).style.display).not.toBe('none');
  wrapper.unmount();
});
it('selects and persists Full screen, and cancellation restores the initial camera', async () => {
  const { wrapper } = await setup(crop, { recording });
  const picker = wrapper.findComponent(Select);
  picker.vm.$emit('update:modelValue', 'fullscreen');
  await flushPromises();
  expect(wrapper.get('.region-size').attributes('aria-label')).toBe('1000 × 500');
  expect(capture.updatePreferences).toHaveBeenCalledWith({
    extras: { screenRegionPreset: 'fullscreen' },
  });
  wrapper.findComponent(toolbar).vm.$emit('cancel');
  expect(capture.configureCameraOverlay).toHaveBeenCalledWith({
    cameraId: 'off',
  });
  expect(capture.cancelScreenRegion).toHaveBeenCalledOnce();
  wrapper.unmount();
});

it('insets both control groups for Full screen even when the toolbar wraps', async () => {
  const { wrapper } = await setup({ x: 0, y: 0, width: 1, height: 1 }, { recording });
  const top = wrapper.get('.region-top-controls').element as HTMLElement;
  const bottom = wrapper.get('.region-recording-toolbar').element as HTMLElement;
  expect(top.style.left).toBe('16px');
  expect(top.style.top).toBe('16px');
  expect(bottom.style.left).toBe('16px');
  expect(bottom.style.bottom).toBe('16px');
  for (const height of [54, 98, 134]) {
    wrapper.findComponent(toolbar).vm.$emit('resize', 710, height);
    await wrapper.vm.$nextTick();
    expect(bottom.style.bottom).toBe('16px');
    expect(bottom.style.top).toBe('');
  }
  wrapper.unmount();
});

it('measures the whole top row and preserves its visible size during gestures and zero measurements', async () => {
  const { wrapper, main } = await setup({
    x: 0.9,
    y: 0.2,
    width: 0.1,
    height: 0.3,
  });
  const top = wrapper.get('.region-top-controls').element as HTMLElement;
  Object.defineProperties(top, {
    offsetWidth: { configurable: true, value: 480 },
    offsetHeight: { configurable: true, value: 36 },
  });
  resizedTop([], {} as ResizeObserver);
  await wrapper.vm.$nextTick();
  expect(top.style.left).toBe('504px');
  Object.defineProperty(top, 'offsetWidth', { configurable: true, value: 0 });
  resizedTop([], {} as ResizeObserver);
  await wrapper.vm.$nextTick();
  expect(top.style.left).toBe('504px');
  await triggerPointer(main, 'pointerdown', {
    clientX: 950,
    clientY: 150,
    pointerId: 1,
  });
  await triggerPointer(main, 'pointermove', {
    clientX: 970,
    clientY: 150,
    pointerId: 1,
  });
  Object.defineProperty(top, 'offsetWidth', { configurable: true, value: 128 });
  resizedTop([], {} as ResizeObserver);
  await wrapper.vm.$nextTick();
  expect(top.style.left).toBe('504px');
  await triggerPointer(main, 'pointerup', { pointerId: 1 });
  Object.defineProperty(top, 'offsetWidth', { configurable: true, value: 480 });
  resizedTop([], {} as ResizeObserver);
  await wrapper.vm.$nextTick();
  expect(top.style.left).toBe('504px');
  wrapper.unmount();
});

it('refreshes viewport geometry when configuration arrives before the window resize event', async () => {
  const { wrapper, configure } = await setup();
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: 600 },
    innerHeight: { configurable: true, value: 400 },
  });
  configure({
    mode: 'select',
    bounds: { x: 0, y: 0, width: 600, height: 400 },
    region: { x: 0.9, y: 0, width: 0.1, height: 1 },
    recording,
  });
  await wrapper.vm.$nextTick();
  const top = wrapper.get('.region-top-controls').element as HTMLElement;
  expect(top.style.left).toBe('274px');
  expect(top.style.top).toBe('16px');
  expect((wrapper.get('.region-recording-toolbar').element as HTMLElement).style.bottom).toBe('16px');
  wrapper.unmount();
});

it('keeps the desktop live by rendering the snapshot only inside the drag magnifier', async () => {
  const preview = 'data:image/png;base64,desktop';
  const { wrapper, main } = await setup(crop, { preview });
  expect(wrapper.find('main > img').exists()).toBe(false);
  expect(wrapper.find('.region-magnifier').exists()).toBe(false);
  await triggerPointer(main, 'pointerdown', {
    clientX: 50,
    clientY: 50,
    pointerId: 1,
  });
  await triggerPointer(main, 'pointermove', {
    clientX: 300,
    clientY: 250,
    pointerId: 1,
  });
  expect(wrapper.get('.region-magnifier img').attributes('src')).toBe(preview);
  expect(wrapper.findAll('main > img')).toHaveLength(0);
  await triggerPointer(main, 'pointerup', { pointerId: 1 });
  expect(wrapper.find('.region-magnifier').exists()).toBe(false);
  wrapper.unmount();
});
