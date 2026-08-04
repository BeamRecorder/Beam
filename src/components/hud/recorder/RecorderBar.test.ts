import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { capture } = vi.hoisted(() => ({
  capture: {
    getPreferences: vi.fn(),
    onPreferencesChanged: vi.fn(),
    getRecorderTooltipSide: vi.fn(),
    setRecorderTooltip: vi.fn(),
    onRecorderTooltipSide: vi.fn(),
  },
}));

vi.mock('../../../api/capture', () => ({ capture }));

import RecorderBar from './RecorderBar.vue';

const settings = {
  schemaVersion: 2,
  theme: 'dark' as const,
  recordingBar: { visibility: 'always' as const },
  devices: {},
  shortcuts: { 'hud.playPause': { keys: 'Ctrl+P', scope: 'global' as const, category: 'recording' } },
  backgroundPresets: { colors: [], gradients: [] },
  extras: {},
};

const Tooltip = { template: '<div class="tooltip-stub"><slot /><slot name="content" /></div>' };
const KeyboardChip = { props: ['shortcut'], template: '<kbd>{{ shortcut }}</kbd>' };

const props = {
  phase: 'recording' as const,
  secondsRemaining: 0,
  recordingTime: '00:12.3',
  cameraEnabled: true,
  microphoneEnabled: true,
  systemAudioEnabled: true,
  visibility: 'always' as const,
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  capture.getPreferences.mockResolvedValue(settings);
  capture.onPreferencesChanged.mockReturnValue(vi.fn());
  capture.getRecorderTooltipSide.mockResolvedValue('right');
  capture.setRecorderTooltip.mockResolvedValue('right');
  capture.onRecorderTooltipSide.mockReturnValue(vi.fn());
  Object.defineProperty(window, 'capture', { configurable: true, value: capture });
});

describe('RecorderBar', () => {
  it('renders recording controls, uses preferences, and emits every action', async () => {
    const wrapper = mount(RecorderBar, { props, global: { stubs: { Tooltip, KeyboardChip } } });
    await vi.waitFor(() => expect(wrapper.get('.recorder-bar').classes()).toContain('tooltip-right'));
    expect(wrapper.get('.recording-time').text()).toBe('00:12.3');
    expect(wrapper.findAll('.control')).toHaveLength(6);
    expect(wrapper.find('kbd').text()).toBe('Ctrl+P');

    const controls = wrapper.findAll('.control');
    await controls[0].trigger('click');
    await controls[1].trigger('click');
    await controls[2].trigger('click');
    await controls[3].trigger('click');
    await controls[4].trigger('click');
    await controls[5].trigger('click');

    expect(wrapper.emitted('pause')).toHaveLength(1);
    expect(wrapper.emitted('stop')).toHaveLength(1);
    expect(wrapper.emitted('microphone')).toHaveLength(1);
    expect(wrapper.emitted('camera')).toHaveLength(1);
    expect(wrapper.emitted('systemAudio')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(capture.getPreferences).toHaveBeenCalledOnce();
    await wrapper.get('.recorder-bar').trigger('mouseenter');
    await wrapper.get('.recorder-bar').trigger('mouseleave');
    wrapper.unmount();
    expect(capture.setRecorderTooltip).toHaveBeenNthCalledWith(1, true);
    expect(capture.setRecorderTooltip).toHaveBeenLastCalledWith(false);
  });

  it('renders countdown and finalizing states with the right disabled controls', async () => {
    const wrapper = mount(RecorderBar, {
      props: { ...props, phase: 'countdown', visibility: 'auto-fade' },
      global: { stubs: { Tooltip, KeyboardChip } },
    });
    await Promise.resolve();
    expect(wrapper.get('.recorder-bar').classes()).toContain('auto-fade');
    expect(wrapper.get('.recording-time').text()).toContain('Ready');
    const controls = wrapper.findAll('.control');
    expect(controls[0].attributes('disabled')).toBeDefined();
    expect(controls[2].attributes('disabled')).toBeDefined();
    expect(controls[3].attributes('disabled')).toBeDefined();
    expect(controls[4].attributes('disabled')).toBeDefined();

    await wrapper.setProps({ phase: 'paused' });
    expect(wrapper.get('.recording-time').text()).toBe('00:12.3');
    expect(wrapper.get('.control').attributes('aria-label')).toContain('Resume');
    await wrapper.setProps({ phase: 'finalizing' });
    expect(wrapper.findAll('.control')[5].attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('updates the tooltip side when native window movement reports a new side', async () => {
    let sideListener: ((side: 'left' | 'right') => void) | undefined;
    capture.onRecorderTooltipSide.mockImplementation((listener) => {
      sideListener = listener;
      return vi.fn();
    });
    const wrapper = mount(RecorderBar, { props, global: { stubs: { Tooltip, KeyboardChip } } });
    await vi.waitFor(() => expect(wrapper.get('.recorder-bar').classes()).toContain('tooltip-right'));
    sideListener?.('left');
    await vi.waitFor(() => expect(wrapper.get('.recorder-bar').classes()).not.toContain('tooltip-right'));
    wrapper.unmount();
  });
});
