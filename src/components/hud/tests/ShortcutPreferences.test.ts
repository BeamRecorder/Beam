import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { capture } = vi.hoisted(() => ({
  capture: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    onPreferencesChanged: vi.fn(),
  },
}));
vi.mock('../../../api/capture', () => ({ capture }));

import ShortcutPreferences from '../settings/ShortcutPreferences.vue';

const settings = (shortcuts: Record<string, { keys: string; scope: 'global'; category: string }> = {}) => ({
  schemaVersion: 2 as const,
  theme: 'dark' as const,
  recordingBar: { visibility: 'always' as const },
  alwaysOnTop: true,
  devices: {},
  shortcuts,
  backgroundPresets: { colors: [], gradients: [] },
  extras: {},
});

const ShortcutInput = {
  props: ['modelValue', 'error'],
  emits: ['update:modelValue', 'reset'],
  template:
    '<div class="shortcut-stub"><span v-if="error" class="shortcut-error">{{ error }}</span><button class="change-shortcut" @click="$emit(\'update:modelValue\', modelValue === \'Alt+Shift+R\' ? \'Alt+Shift+R\' : \'Ctrl+Shift+X\')">change</button><button class="reset-shortcut" @click="$emit(\'reset\')">reset</button></div>',
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  capture.getPreferences.mockResolvedValue(
    settings({
      'hud.startStopRecording': { keys: 'Alt+Shift+R', scope: 'global', category: 'hud' },
      'hud.playPause': { keys: 'Alt+Shift+R', scope: 'global', category: 'hud' },
    }),
  );
  capture.updatePreferences.mockResolvedValue(settings());
  capture.onPreferencesChanged.mockReturnValue(vi.fn());
  Object.defineProperty(window, 'capture', { configurable: true, value: capture });
});

describe('ShortcutPreferences', () => {
  it('loads all definitions, detects conflicts, and resets a shortcut', async () => {
    const wrapper = mount(ShortcutPreferences, { global: { stubs: { ShortcutInput } } });
    await vi.waitFor(() => expect(capture.getPreferences).toHaveBeenCalledOnce());
    expect(wrapper.findAll('.shortcut-row')).toHaveLength(10);
    expect(wrapper.findAll('.shortcut-row')[0].find('.shortcut-label').text()).toBe('Quick Snip');

    await wrapper.findAll('.change-shortcut')[1].trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.shortcut-error').text()).toContain('Conflict');
    expect(capture.updatePreferences).not.toHaveBeenCalled();

    await wrapper.findAll('.reset-shortcut')[1].trigger('click');
    expect(capture.updatePreferences).not.toHaveBeenCalled();
  });

  it('persists a changed shortcut and displays a persistence error', async () => {
    const wrapper = mount(ShortcutPreferences, { global: { stubs: { ShortcutInput } } });
    await vi.waitFor(() => expect(capture.getPreferences).toHaveBeenCalledOnce());
    await wrapper.findAll('.change-shortcut')[0].trigger('click');
    await vi.waitFor(() => expect(capture.updatePreferences).toHaveBeenCalledOnce());
    expect(capture.updatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        shortcuts: expect.objectContaining({ 'quickSnip.toggle': expect.objectContaining({ keys: 'Ctrl+Shift+X' }) }),
      }),
    );

    capture.updatePreferences.mockRejectedValueOnce(new Error('preferences unavailable'));
    await wrapper.findAll('.change-shortcut')[0].trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.shortcut-error').exists()).toBe(true));
    expect(wrapper.find('.shortcut-error').text()).toContain('preferences unavailable');
  });
});
