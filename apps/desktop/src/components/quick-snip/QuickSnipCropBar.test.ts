import { enableAutoUnmount, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuickSnipCropBar from './QuickSnipCropBar.vue';

const mock = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('~/api/capture', () => ({ capture: {} }));
vi.mock('./useQuickSnipCropBar', () => ({
  useQuickSnipCropBar: () => mock.current,
}));
enableAutoUnmount(afterEach);

const mode = ref('screenshot');
const displayMode = ref('screenshot');
const recording = ref(false);
const preparing = ref(false);
const toggle = vi.fn();

beforeEach(() => {
  mode.value = displayMode.value = 'screenshot';
  recording.value = preparing.value = false;
  toggle.mockClear();
  mock.current = {
    visibility: 'always',
    pointerOver: false,
    selectionActive: true,
    recording,
    mode,
    displayMode,
    recorder: { recorderHoverOnlyActive: ref(false), phase: ref('idle') },
    compact: false,
    settingsDisabled: false,
    selectedPresetId: 'default',
    presetOptions: [],
    selectPreset: vi.fn(),
    microphone: false,
    microphoneLevel: 0,
    systemAudio: false,
    systemAudioLevel: 0,
    camera: false,
    automaticZoom: false,
    elapsed: '00:00',
    captureHint: 'Capture',
    preparing,
    actionPending: false,
    configured: true,
    captureTarget: ref('screen'),
    selectSource: vi.fn(),
    openSettings: vi.fn(),
    settingsOpen: ref(false),
    dismissSettings: vi.fn(),
    chooseDevice: vi.fn().mockResolvedValue(undefined),
    onDeviceKeydown: vi.fn(),
    reportFailure: vi.fn(),
    deviceMenuBusy: false,
    toggleFromControls: toggle,
    cancel: vi.fn(),
  };
});
const mountBar = () =>
  mount(QuickSnipCropBar, {
    global: { stubs: { RecorderBar: true, AudioIconMeter: true } },
  });

describe('Quick Snip capture assets', () => {
  it('uses the Screenshot asset in the preset and capture action', async () => {
    const wrapper = mountBar();
    for (const selector of ['[data-mode="screenshot"]', '.capture-actions .capture-mode-icon']) {
      expect(wrapper.get(selector).attributes('style')).toContain('beam-screenshot.svg');
      expect(wrapper.get(selector).attributes('aria-hidden')).toBe('true');
    }
    await wrapper.get('.capture-actions .btn-primary').trigger('click');
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('uses the Recorder icon and a text-free record action in video mode', async () => {
    mode.value = 'instant';
    displayMode.value = 'studio';
    const wrapper = mountBar();
    expect(wrapper.get('[data-mode="studio"]').attributes('style')).toContain('beam-recorder.svg');
    expect(wrapper.find('.capture-actions .lucide-circle').exists()).toBe(true);
    expect(wrapper.get('.capture-actions button').text()).toBe('');
    recording.value = true;
    await nextTick();
    expect(wrapper.find('.capture-actions .lucide-circle').exists()).toBe(true);
    expect(wrapper.find('.capture-actions .capture-mode-icon').exists()).toBe(false);
  });

  it('shows loading and blocks the capture action while preparing', async () => {
    const wrapper = mountBar();
    preparing.value = true;
    await nextTick();
    expect(wrapper.get('.capture-actions .btn-primary').attributes('disabled')).toBeDefined();
    expect(wrapper.find('.capture-actions .icon-spin').exists()).toBe(true);
    expect(wrapper.find('.capture-actions .capture-mode-icon').exists()).toBe(false);
    await wrapper.get('.capture-actions .btn-primary').trigger('click');
    expect(toggle).not.toHaveBeenCalled();
  });
});

it('opens each source chooser from an icon-only button', async () => {
  const wrapper = mountBar();
  for (const [label, target] of [
    ['Full screen', 'screen'],
    ['Region', 'region'],
    ['Window', 'window'],
  ]) {
    const button = wrapper.get(`button[aria-label="${label}"]`);
    expect(button.text()).toBe('');
    await button.trigger('click');
    expect(mock.current.selectSource).toHaveBeenCalledWith(target);
  }
});
it('opens settings from the final settings icon', async () => {
  const wrapper = mountBar();
  await wrapper.get('button[aria-label="Recording settings"]').trigger('click');
  expect(mock.current.openSettings).toHaveBeenCalledOnce();
});
it('keeps only the two short mode labels and hides devices for images', () => {
  const wrapper = mountBar();
  expect(wrapper.findAll('.btn-content-label').map((label) => label.text())).toEqual(['Video', 'Image']);
  expect(wrapper.find('.device-controls').exists()).toBe(false);
});

it('keeps one circular 40px capture button in both modes and uses neutral choice groups', async () => {
  const wrapper = mountBar();
  const button = wrapper.get('.capture-actions button').element;
  expect(wrapper.findAll('.btn-group.variant-neutral')).toHaveLength(2);
  expect((button as HTMLElement).style.width).toBe('40px');
  expect((button as HTMLElement).style.height).toBe('40px');
  expect((button as HTMLElement).style.borderRadius).toBe('var(--radius-full)');
  mode.value = 'studio';
  displayMode.value = 'studio';
  await nextTick();
  expect(wrapper.get('.capture-actions button').element).toBe(button);
  expect(wrapper.findAll('.capture-actions button')).toHaveLength(1);
  expect(wrapper.find('.capture-actions .lucide-circle').exists()).toBe(true);
});
it('anchors Settings to the actual cog and exposes its selected state', async () => {
  const wrapper = mountBar();
  const button = wrapper.get('button[aria-haspopup="dialog"]');
  vi.spyOn(button.element, 'getBoundingClientRect').mockReturnValue({
    x: 400,
    y: 22,
    left: 400,
    top: 22,
    width: 32,
    height: 32,
    right: 432,
    bottom: 54,
    toJSON: () => ({}),
  });
  await button.trigger('click');
  expect(mock.current.openSettings).toHaveBeenCalledWith({ x: 400, y: 22, width: 32, height: 32 });
  (mock.current.settingsOpen as ReturnType<typeof ref>).value = true;
  await nextTick();
  expect(button.attributes('aria-expanded')).toBe('true');
  expect(button.classes()).toContain('btn-selected');
  await wrapper.get('.capture-modes button').trigger('pointerdown');
  expect(mock.current.dismissSettings).toHaveBeenCalledOnce();
});
it('prevents native context menus and opens the shared device menu at the selected button', async () => {
  mode.value = 'studio';
  displayMode.value = 'studio';
  const wrapper = mountBar();
  const button = wrapper.get('button[aria-label="Microphone"]');
  vi.spyOn(button.element, 'getBoundingClientRect').mockReturnValue({
    x: 400,
    y: 22,
    left: 400,
    top: 22,
    width: 32,
    height: 32,
    right: 432,
    bottom: 54,
    toJSON: () => ({}),
  });
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  button.element.dispatchEvent(event);
  await nextTick();
  expect(event.defaultPrevented).toBe(true);
  expect(mock.current.chooseDevice).toHaveBeenCalledWith('microphone', { x: 416, y: 54 });
  const background = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  wrapper.element.dispatchEvent(background);
  expect(background.defaultPrevented).toBe(true);
});
it('retains the close intent if native blur arrives between pressing and releasing the cog', async () => {
  (mock.current.settingsOpen as ReturnType<typeof ref>).value = true;
  const wrapper = mountBar();
  const button = wrapper.get('button[aria-haspopup="dialog"]');
  await button.trigger('pointerdown');
  (mock.current.settingsOpen as ReturnType<typeof ref>).value = false;
  await nextTick();
  await button.trigger('click');
  expect(mock.current.dismissSettings).toHaveBeenCalledOnce();
  expect(mock.current.openSettings).not.toHaveBeenCalled();
});
