import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  visibility: 'always' as const,
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  capture.getPreferences.mockResolvedValue(settings);
  capture.onPreferencesChanged.mockReturnValue(vi.fn());
  Object.defineProperty(window, 'capture', { configurable: true, value: capture });
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

  it('keeps the bar transparent until hover in hover-only mode, except during countdown', async () => {
    const wrapper = mount(RecorderBar, {
      props: { ...props, visibility: 'hover-only', hoverOnlyActive: true },
    });

    expect(wrapper.get('.recorder-bar').classes()).toContain('hover-only');
    await wrapper.setProps({ hoverOnlyActive: false });
    expect(wrapper.get('.recorder-bar').classes()).not.toContain('hover-only');
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
