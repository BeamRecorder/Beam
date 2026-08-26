import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capture: {
    getEditorPresets: vi.fn(),
    updateActiveEditorPreset: vi.fn(),
    selectEditorPreset: vi.fn(),
    quickSnipStart: vi.fn(),
    quickSnipToggle: vi.fn(),
    quickSnipStop: vi.fn(),
    quickSnipCancel: vi.fn(),
    configureQuickSnip: vi.fn(),
    reportQuickSnip: vi.fn(),
    onQuickSnipConfigure: vi.fn(),
    onQuickSnipCommand: vi.fn(),
  },
  recorder: null as {
    phase: { value: string };
    recordingTime: { value: string };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  } | null,
  configure: null as ((configuration: QuickSnipConfiguration) => unknown) | null,
  command: null as ((command: 'start' | 'stop' | 'cancel') => unknown) | null,
  offConfigure: null as ReturnType<typeof vi.fn> | null,
  offCommand: null as ReturnType<typeof vi.fn> | null,
}));

vi.mock('~/api/capture', () => ({ capture: mocks.capture }));
vi.mock('~/components/hud/recorder/useRecordingController', async () => {
  const { ref } = await import('vue');
  return {
    useRecordingController: () => {
      const recorder = {
        phase: ref('idle'),
        recordingTime: ref('00:00.0'),
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        cancel: vi.fn().mockResolvedValue(undefined),
      };
      mocks.recorder = recorder;
      return recorder;
    },
  };
});

import type { QuickSnipConfiguration } from '~/api/types/quick-snip';
import QuickSnipCropBar from '../src/components/quick-snip/QuickSnipCropBar.vue';

const preset = {
  id: 'default',
  name: 'Default',
  protected: true,
  updatedAt: '2026-01-01T00:00:00.000Z',
  settings: {
    editor: { schemaVersion: 1 as const },
    devices: { micId: 'mic-1', cameraId: 'camera-1', systemAudioMode: 'off' },
    export: { format: 'mp4' as const },
    quickSnip: { automaticZoom: true },
  },
};
const presetDocument = { schemaVersion: 1 as const, activePresetId: preset.id, presets: [preset] };
const configuration = {
  mode: 'studio' as const,
  format: 'mp4' as const,
  name: 'Quick Snip',
  preset,
  automaticZoom: true,
  region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  regionBounds: { x: 0, y: 0, width: 1920, height: 1080 },
  displayId: 'display-1',
  screenId: 'screen-1',
  rawOutputRoot: '/videos/Beam/user/quick-snip/.work',
  devices: preset.settings.devices,
} satisfies QuickSnipConfiguration;

const ButtonStub = {
  inheritAttrs: true,
  props: ['disabled'],
  emits: ['click'],
  template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};
const SwitchStub = {
  props: ['modelValue', 'label'],
  emits: ['update:modelValue'],
  template:
    '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />{{ label }}</label>',
};

const mountBar = async () => {
  const wrapper = mount(QuickSnipCropBar, {
    attachTo: document.body,
    global: { stubs: { Button: ButtonStub, Switch: SwitchStub } },
  });
  await mocks.configure?.(configuration);
  await flushPromises();
  return wrapper;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recorder = null;
  mocks.configure = null;
  mocks.command = null;
  mocks.offConfigure = null;
  mocks.offCommand = null;
  mocks.capture.getEditorPresets.mockResolvedValue(presetDocument);
  mocks.capture.updateActiveEditorPreset.mockResolvedValue(presetDocument);
  mocks.capture.selectEditorPreset.mockResolvedValue(presetDocument);
  mocks.capture.quickSnipStart.mockResolvedValue({ state: 'preparing' });
  mocks.capture.quickSnipToggle.mockResolvedValue({ state: 'preparing' });
  mocks.capture.quickSnipStop.mockResolvedValue({ state: 'finalizing' });
  mocks.capture.quickSnipCancel.mockResolvedValue({ state: 'canceled' });
  mocks.capture.configureQuickSnip.mockResolvedValue({ state: 'selecting' });
  mocks.capture.reportQuickSnip.mockResolvedValue({ state: 'recording' });
  mocks.capture.onQuickSnipConfigure.mockImplementation((listener: (value: QuickSnipConfiguration) => unknown) => {
    mocks.configure = listener;
    mocks.offConfigure = vi.fn();
    return mocks.offConfigure;
  });
  mocks.capture.onQuickSnipCommand.mockImplementation((listener: (value: 'start' | 'stop' | 'cancel') => unknown) => {
    mocks.command = listener;
    mocks.offCommand = vi.fn();
    return mocks.offCommand;
  });
});

describe('QuickSnipCropBar', () => {
  it('keeps preset selection but exposes no preset CRUD controls', async () => {
    const wrapper = await mountBar();

    expect(wrapper.findAll('select')).toHaveLength(3);
    expect(wrapper.text()).not.toMatch(/Add|Rename|Delete|Save/);
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it('keeps Raw free of camera, preset and zoom controls and starts with native-raw options', async () => {
    const wrapper = await mountBar();
    await wrapper.findAll('select')[0].setValue('raw');
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('select')[1].attributes('disabled')).toBeDefined();
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    expect(wrapper.findAll('button')).toHaveLength(4);

    await mocks.command?.('start');
    await flushPromises();
    expect(mocks.capture.quickSnipStart).not.toHaveBeenCalled();
    expect(mocks.recorder?.start).toHaveBeenCalledWith(
      expect.objectContaining({
        cameraId: 'off',
        cursor: false,
        recordInteractions: false,
        region: configuration.region,
      }),
    );
    expect(mocks.recorder?.start.mock.calls[0][0]).not.toHaveProperty('camera');
    expect(mocks.recorder?.start.mock.calls[0][0]).not.toHaveProperty('preset');
    expect(mocks.recorder?.start.mock.calls[0][0]).not.toHaveProperty('zoom');

    wrapper.unmount();
  });

  it('routes the Start and Stop button and crop-bar commands through the same Quick Snip IPC', async () => {
    const wrapper = await mountBar();
    const startButton = wrapper.findAll('button').find((button) => button.text() === 'Start');
    expect(startButton).toBeDefined();

    mocks.capture.configureQuickSnip.mockClear();
    mocks.capture.quickSnipToggle.mockClear();
    await startButton!.trigger('click');
    expect(mocks.capture.configureQuickSnip).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'studio', format: 'mp4', automaticZoom: true }),
    );
    expect(mocks.capture.quickSnipToggle).toHaveBeenCalledOnce();

    await mocks.command?.('start');
    await flushPromises();
    expect(mocks.capture.quickSnipStart).not.toHaveBeenCalled();
    expect(mocks.recorder?.start).toHaveBeenCalledOnce();

    mocks.recorder!.phase.value = 'recording';
    await wrapper.vm.$nextTick();
    const stopButton = wrapper.findAll('button').find((button) => button.text() === 'Stop');
    expect(stopButton).toBeDefined();
    mocks.capture.quickSnipToggle.mockClear();
    await stopButton!.trigger('click');
    expect(mocks.capture.quickSnipToggle).toHaveBeenCalledOnce();

    await mocks.command?.('stop');
    await flushPromises();
    expect(mocks.recorder?.stop).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('shows Default while the preset document is delayed or empty', async () => {
    const emptyDocument = { schemaVersion: 1 as const, activePresetId: null, presets: [] };
    let resolveDocument!: (document: typeof emptyDocument) => void;
    mocks.capture.getEditorPresets.mockReturnValue(
      new Promise((resolve) => {
        resolveDocument = resolve;
      }),
    );

    const wrapper = mount(QuickSnipCropBar, {
      attachTo: document.body,
      global: { stubs: { Button: ButtonStub, Switch: SwitchStub } },
    });
    void mocks.configure?.(configuration);
    await wrapper.vm.$nextTick();

    const presetSelect = wrapper.get('.preset-select');
    expect(presetSelect.text()).toContain('Default');
    expect(presetSelect.text()).not.toContain('Select an option');

    resolveDocument(emptyDocument);
    await flushPromises();
    expect(presetSelect.text()).toContain('Default');
    expect(presetSelect.text()).not.toContain('Select an option');
    wrapper.unmount();
  });

  it('uses native title attributes and never mounts a custom tooltip for Crop Bar actions', async () => {
    const wrapper = await mountBar();
    const titles = wrapper
      .findAll('button')
      .map((button) => button.attributes('title'))
      .filter(Boolean);

    expect(titles).toEqual(expect.arrayContaining(['Microphone', 'System audio', 'Camera', 'Cancel']));
    expect(wrapper.findAll('[tooltip]')).toHaveLength(0);
    expect(wrapper.findAll('.tooltip-wrapper')).toHaveLength(0);

    wrapper.unmount();
  });

  it('removes all IPC listeners on unmount', async () => {
    const wrapper = await mountBar();
    wrapper.unmount();

    expect(mocks.offConfigure).toHaveBeenCalledOnce();
    expect(mocks.offCommand).toHaveBeenCalledOnce();
  });

  it('shows the real recorder duration and switches to HH:MM:SS after one hour', async () => {
    const wrapper = await mountBar();
    mocks.recorder!.phase.value = 'recording';
    mocks.recorder!.recordingTime.value = '01:02.3';
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.elapsed').text()).toBe('01:02');

    mocks.recorder!.recordingTime.value = '60:00.0';
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.elapsed').text()).toBe('01:00:00');
    wrapper.unmount();
  });
});
