import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { capture } = vi.hoisted(() => ({
  capture: {
    getPreferences: vi.fn(),
    onPreferencesChanged: vi.fn(),
  },
}));

vi.mock('../../../api/capture', () => ({ capture }));

import RecorderBar from './RecorderBar.vue';

const settings = {
  schemaVersion: 3,
  theme: 'dark' as const,
  recordingBar: { visibility: 'always' as const },
  recordingInteractions: { enabled: false, noticeDismissed: false },
  alwaysOnTop: true,
  devices: {},
  shortcuts: { 'hud.playPause': { keys: 'Ctrl+P', scope: 'global' as const, category: 'recording' } },
  backgroundPresets: { colors: [], gradients: [] },
  extras: {},
};

const props = {
  phase: 'recording' as const,
  secondsRemaining: 0,
  recordingTime: '00:12.3',
  cameraEnabled: true,
  microphoneEnabled: true,
  systemAudioEnabled: true,
  systemAudioLevel: 0,
  visibility: 'always' as const,
};

const originalMediaDevices = navigator.mediaDevices;
const getDisplayMedia = vi.fn();
const emptyDisplayStream = () => ({
  getAudioTracks: () => [],
  getVideoTracks: () => [],
  getTracks: () => [],
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  getDisplayMedia.mockReset();
  getDisplayMedia.mockResolvedValue(emptyDisplayStream());
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getDisplayMedia },
  });
  capture.getPreferences.mockResolvedValue(settings);
  capture.onPreferencesChanged.mockReturnValue(vi.fn());
  Object.defineProperty(window, 'capture', { configurable: true, value: capture });
});

afterEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalMediaDevices });
});

describe('RecorderBar', () => {
  it('renders recording controls, uses preferences, and emits every action', async () => {
    const wrapper = mount(RecorderBar, { props });
    expect(wrapper.get('.recording-time').text()).toBe('00:12.3');
    expect(wrapper.findAll('.control')).toHaveLength(6);
    expect(wrapper.get('.recorder-bar').attributes('aria-label')).toBeTruthy();
    wrapper.findAll('button').forEach((button) => {
      expect(button.attributes('aria-label')).toBeTruthy();
      expect(button.attributes('title')).toBeTruthy();
    });

    const controls = wrapper.findAll('.control');
    for (const control of controls) {
      await control.trigger('pointerdown', { button: 0 });
      await control.trigger('click');
    }

    expect(wrapper.emitted('pause')).toHaveLength(1);
    expect(wrapper.emitted('stop')).toHaveLength(1);
    expect(wrapper.emitted('microphone')).toHaveLength(1);
    expect(wrapper.emitted('camera')).toHaveLength(1);
    expect(wrapper.emitted('systemAudio')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    wrapper.unmount();
  });

  it('renders countdown and finalizing states with the right disabled controls', async () => {
    const wrapper = mount(RecorderBar, {
      props: { ...props, phase: 'countdown', visibility: 'auto-fade' },
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
    expect(wrapper.findAll('.control').every((control) => control.attributes('disabled') !== undefined)).toBe(true);
    wrapper.unmount();
  });

  it('tracks pointer entry and exit for hover-only and auto-fade visibility', async () => {
    const wrapper = mount(RecorderBar, {
      props: { ...props, visibility: 'hover-only', hoverOnlyActive: true },
    });

    expect(wrapper.get('.recorder-bar').classes()).toContain('hover-only');
    await wrapper.get('.recorder-bar').trigger('pointerenter');
    expect(wrapper.get('.recorder-bar').classes()).toContain('pointer-over');
    await wrapper.get('.recorder-bar').trigger('pointerleave');
    expect(wrapper.get('.recorder-bar').classes()).not.toContain('pointer-over');
    await wrapper.setProps({ visibility: 'auto-fade' });
    await wrapper.get('.recorder-bar').trigger('pointerenter');
    expect(wrapper.get('.recorder-bar').classes()).toEqual(expect.arrayContaining(['auto-fade', 'pointer-over']));
    await wrapper.setProps({ visibility: 'hover-only', hoverOnlyActive: false });
    expect(wrapper.get('.recorder-bar').classes()).not.toContain('hover-only');
  });

  it('propagates the native system audio level to the system meter', async () => {
    const wrapper = mount(RecorderBar, {
      props: { ...props, systemAudioLevel: 0.68 },
    });

    const meters = wrapper.findAll('.audio-icon-meter');
    expect(meters).toHaveLength(2);
    expect(meters[1]?.get('.level-bar-fill').element).toHaveProperty('style.height', '68%');

    await wrapper.setProps({ systemAudioLevel: 0.12 });
    expect(meters[1]?.get('.level-bar-fill').element).toHaveProperty('style.height', '12%');
    wrapper.unmount();
  });

  it('does not request a second desktop stream for an already acquired system-audio recording', async () => {
    await getDisplayMedia({ audio: true, video: true });
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);

    const wrapper = mount(RecorderBar, { props });
    await Promise.resolve();

    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('shows the Preparing throbber and never the timer while starting', async () => {
    const wrapper = mount(RecorderBar, {
      props: { ...props, phase: 'starting' as const },
    });
    expect(wrapper.get('.recording-time').text()).toContain('Preparing');
    expect(wrapper.get('.recording-time').text()).not.toContain('00:');
    // Pause and the three device toggles are disabled during startup.
    const controls = wrapper.findAll('.control');
    expect(controls[0].attributes('disabled')).toBeDefined();
    expect(controls[2].attributes('disabled')).toBeDefined();
    expect(controls[3].attributes('disabled')).toBeDefined();
    expect(controls[4].attributes('disabled')).toBeDefined();
    // Stop and cancel stay available so startup can be aborted.
    expect(controls[1].attributes('disabled')).toBeUndefined();
    expect(controls[5].attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('keeps pause and stop clickable on their first pointer interaction', async () => {
    const wrapper = mount(RecorderBar, { props });
    const controls = wrapper.findAll('.control');
    await controls[0].trigger('pointerdown', { button: 0 });
    await controls[0].trigger('click');
    await controls[1].trigger('pointerdown', { button: 0 });
    await controls[1].trigger('click');

    expect(wrapper.emitted('pause')).toHaveLength(1);
    expect(wrapper.emitted('stop')).toHaveLength(1);
    wrapper.unmount();
  });
});
