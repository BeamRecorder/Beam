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
    for (const selector of ['.preset-field .capture-mode-icon', '.capture-actions .capture-mode-icon']) {
      expect(wrapper.get(selector).attributes('style')).toContain('beam-screenshot.svg');
      expect(wrapper.get(selector).attributes('aria-hidden')).toBe('true');
    }
    await wrapper.get('.capture-actions .btn-primary').trigger('click');
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('uses the Recorder preset asset for Studio choices and retains Start/Stop actions', async () => {
    mode.value = 'instant';
    displayMode.value = 'studio';
    const wrapper = mountBar();
    expect(wrapper.get('.preset-field .capture-mode-icon').attributes('style')).toContain('beam-recorder.svg');
    expect(wrapper.find('.capture-actions .lucide-play').exists()).toBe(true);
    recording.value = true;
    await nextTick();
    expect(wrapper.find('.capture-actions .lucide-square').exists()).toBe(true);
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
