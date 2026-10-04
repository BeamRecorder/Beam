import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import QuickSnipSelectionBar from './QuickSnipSelectionBar.vue';
import type { QuickSnipSelectionState } from './quick-snip-selection-types';
const state: QuickSnipSelectionState = {
  displayMode: 'studio',
  mode: 'studio',
  captureTarget: 'screen',
  settingsDisabled: false,
  microphone: false,
  microphoneLevel: 0,
  systemAudio: false,
  systemAudioLevel: 0,
  camera: false,
  settingsOpen: false,
  captureHint: 'Start recording',
  preparing: false,
  actionPending: false,
  configured: true,
  deviceMenuBusy: false,
};
describe('shared Quick Snip selection bar', () => {
  it('forwards source, mode, capture and cancel intents without owning native APIs', async () => {
    const wrapper = mount(QuickSnipSelectionBar, { props: { state, embedded: true } });
    await wrapper.trigger('pointerenter');
    await wrapper.trigger('pointerleave');
    expect(wrapper.emitted('pointer-over')).toEqual([[true], [false]]);
    for (const label of ['Video', 'Image', 'Full screen', 'Region', 'Window', 'Start recording', 'Cancel']) {
      await wrapper.get(`[aria-label="${label}"]`).trigger('click');
    }
    expect(wrapper.emitted('update:displayMode')).toEqual([['studio'], ['screenshot']]);
    expect(wrapper.emitted('select-source')).toEqual([['screen'], ['region'], ['window']]);
    expect(wrapper.emitted('capture')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    wrapper.unmount();
  });
  it('preserves pointer, context-menu, keyboard and settings intent contracts', async () => {
    const wrapper = mount(QuickSnipSelectionBar, { props: { state } });
    for (const label of ['Microphone', 'System audio', 'Camera']) {
      const button = wrapper.get(`[aria-label="${label}"]`);
      await button.trigger('click');
      await button.trigger('contextmenu');
      await button.trigger('keydown', { key: 'Enter' });
    }
    expect(wrapper.emitted('device-menu')).toHaveLength(6);
    expect(wrapper.emitted('device-keydown')).toHaveLength(3);
    const settings = wrapper.get('[aria-haspopup="dialog"]');
    await settings.trigger('pointerdown');
    await settings.trigger('pointercancel');
    await settings.trigger('click');
    expect(wrapper.emitted('settings-intent')).toEqual([[]]);
    expect(wrapper.emitted('cancel-settings-intent')).toEqual([[]]);
    expect(wrapper.emitted('toggle-settings')).toHaveLength(1);
    wrapper.unmount();
  });
  it('shows real device state and keeps controls disabled while preparation is pending', async () => {
    const wrapper = mount(QuickSnipSelectionBar, {
      props: {
        state: {
          ...state,
          microphone: true,
          systemAudio: true,
          camera: true,
          microphoneLevel: 0.3,
          systemAudioLevel: 0.4,
          settingsOpen: true,
        },
      },
    });
    expect(wrapper.get('[aria-label="Camera"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-haspopup="dialog"]').attributes('aria-expanded')).toBe('true');
    await wrapper.setProps({ state: { ...state, settingsDisabled: true, preparing: true } });
    await wrapper.get('[aria-label="Start recording"]').trigger('click');
    expect(wrapper.emitted('capture')).toBeUndefined();
    await wrapper.setProps({ state: { ...state, mode: 'screenshot', displayMode: 'screenshot' } });
    expect(wrapper.find('[aria-label="Camera"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
