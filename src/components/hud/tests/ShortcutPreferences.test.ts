import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentLocale } from '../../../i18n';

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
    '<div class="shortcut-stub"><span class="shortcut-value">{{ modelValue }}</span><span v-if="error" class="shortcut-error">{{ error }}</span><button class="change-shortcut" @click="$emit(\'update:modelValue\', modelValue === \'Alt+Shift+R\' ? \'Alt+Shift+R\' : modelValue === \'Ctrl+Shift+X\' ? \'Alt+Shift+Q\' : \'Ctrl+Shift+X\')">change</button><button class="set-conflict-shortcut" @click="$emit(\'update:modelValue\', \'Ctrl+Shift+X\')">conflict</button><button class="set-teleprompter-shortcut" @click="$emit(\'update:modelValue\', \'Ctrl+Shift+T\')">teleprompter</button><button class="same-shortcut" @click="$emit(\'update:modelValue\', modelValue)">same</button><button class="empty-shortcut" @click="$emit(\'update:modelValue\', \'\')">empty</button><button class="reset-shortcut" @click="$emit(\'reset\')">reset</button></div>',
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
    expect(wrapper.findAll('.shortcut-row')[0].find('.shortcut-value').text()).toBe('Alt+Shift+S');

    await wrapper.findAll('.change-shortcut')[1].trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.shortcut-error').text()).toContain('Conflict');
    expect(capture.updatePreferences).not.toHaveBeenCalled();

    await wrapper.findAll('.reset-shortcut')[1].trigger('click');
    expect(capture.updatePreferences).not.toHaveBeenCalled();
  });

  it('loads a saved Quick Snip shortcut and persists its reset to the default', async () => {
    capture.getPreferences.mockResolvedValueOnce(
      settings({
        'quickSnip.toggle': { keys: 'Ctrl+Shift+X', scope: 'global', category: 'quick-snip' },
        'hud.startStopRecording': { keys: 'Alt+Shift+R', scope: 'global', category: 'hud' },
        'hud.playPause': { keys: 'Alt+Shift+P', scope: 'global', category: 'hud' },
      }),
    );
    const wrapper = mount(ShortcutPreferences, { global: { stubs: { ShortcutInput } } });
    await vi.waitFor(() => expect(capture.getPreferences).toHaveBeenCalledOnce());
    const quickSnipRow = wrapper.findAll('.shortcut-row')[0];
    await vi.waitFor(() => expect(quickSnipRow.find('.shortcut-value').text()).toBe('Ctrl+Shift+X'));

    await quickSnipRow.find('.reset-shortcut').trigger('click');

    await vi.waitFor(() => expect(capture.updatePreferences).toHaveBeenCalledOnce());
    expect(capture.updatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        shortcuts: expect.objectContaining({
          'quickSnip.toggle': expect.objectContaining({ keys: 'Alt+Shift+S' }),
        }),
      }),
    );
    await vi.waitFor(() => expect(quickSnipRow.find('.shortcut-value').text()).toBe('Alt+Shift+S'));
  });

  it('clears a conflict when the already-saved empty shortcut is submitted again', async () => {
    capture.getPreferences.mockResolvedValueOnce(
      settings({
        'quickSnip.toggle': { keys: '', scope: 'global', category: 'quick-snip' },
        'obsolete.action': { keys: 'Ctrl+Shift+X', scope: 'global', category: 'legacy' },
        'hud.startStopRecording': { keys: 'Alt+Shift+R', scope: 'global', category: 'hud' },
        'hud.playPause': { keys: 'Alt+Shift+P', scope: 'global', category: 'hud' },
      }),
    );
    const wrapper = mount(ShortcutPreferences, { global: { stubs: { ShortcutInput } } });
    await vi.waitFor(() => expect(capture.getPreferences).toHaveBeenCalledOnce());
    const quickSnipRow = wrapper.findAll('.shortcut-row')[0];
    await vi.waitFor(() => expect(quickSnipRow.find('.shortcut-value').text()).toBe(''));

    await quickSnipRow.find('.set-conflict-shortcut').trigger('click');
    expect(quickSnipRow.find('.shortcut-error').text()).toContain('obsolete.action');

    await quickSnipRow.find('.same-shortcut').trigger('click');
    await wrapper.vm.$nextTick();
    expect(quickSnipRow.find('.shortcut-error').exists()).toBe(false);
    expect(capture.updatePreferences).not.toHaveBeenCalled();
  });

  it('uses fallback categories when shortcuts are missing or newly added', async () => {
    const preferencesWithoutShortcuts = { ...settings(), shortcuts: undefined } as unknown as ReturnType<
      typeof settings
    >;
    capture.getPreferences.mockResolvedValueOnce(preferencesWithoutShortcuts);
    capture.updatePreferences.mockImplementation(
      async (patch: { shortcuts?: Record<string, { keys: string; scope: 'global'; category: string }> }) =>
        settings(patch.shortcuts ?? {}),
    );
    const wrapper = mount(ShortcutPreferences, { global: { stubs: { ShortcutInput } } });
    await vi.waitFor(() => expect(capture.getPreferences).toHaveBeenCalledOnce());
    const rows = wrapper.findAll('.shortcut-row');

    await rows[0].find('.change-shortcut').trigger('click');
    await vi.waitFor(() => expect(capture.updatePreferences).toHaveBeenCalledTimes(1));
    expect(capture.updatePreferences.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        shortcuts: expect.objectContaining({
          'quickSnip.toggle': expect.objectContaining({ category: 'quick-snip', keys: 'Ctrl+Shift+X' }),
        }),
      }),
    );

    await rows[1].find('.change-shortcut').trigger('click');
    await vi.waitFor(() => expect(capture.updatePreferences).toHaveBeenCalledTimes(2));
    expect(capture.updatePreferences.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        shortcuts: expect.objectContaining({
          'hud.startStopRecording': expect.objectContaining({ category: 'hud', keys: 'Alt+Shift+R' }),
        }),
      }),
    );

    await rows[6].find('.set-teleprompter-shortcut').trigger('click');
    await vi.waitFor(() => expect(capture.updatePreferences).toHaveBeenCalledTimes(3));
    expect(capture.updatePreferences.mock.calls[2][0]).toEqual(
      expect.objectContaining({
        shortcuts: expect.objectContaining({
          'teleprompter.toggleVisibility': expect.objectContaining({ category: 'teleprompter', keys: 'Ctrl+Shift+T' }),
        }),
      }),
    );
  });

  it('translates the Quick Snip description into French while keeping the brand label', async () => {
    setCurrentLocale('fr');
    const wrapper = mount(ShortcutPreferences, { global: { stubs: { ShortcutInput } } });
    await vi.waitFor(() => expect(capture.getPreferences).toHaveBeenCalledOnce());
    const quickSnipRow = wrapper.findAll('.shortcut-row')[0];

    expect(quickSnipRow.find('.shortcut-label').text()).toBe('Quick Snip');
    expect(quickSnipRow.find('.shortcut-desc').text()).toBe(
      'Ouvrir Quick Snip, démarrer ou arrêter la capture selon son état.',
    );
    wrapper.unmount();
  });

  it('persists a changed shortcut and displays a persistence error', async () => {
    capture.updatePreferences.mockImplementation(
      async (patch: { shortcuts?: Record<string, { keys: string; scope: 'global'; category: string }> }) =>
        settings(patch.shortcuts ?? {}),
    );
    const wrapper = mount(ShortcutPreferences, { global: { stubs: { ShortcutInput } } });
    await vi.waitFor(() => expect(capture.getPreferences).toHaveBeenCalledOnce());
    await wrapper.findAll('.change-shortcut')[0].trigger('click');
    await vi.waitFor(() => expect(capture.updatePreferences).toHaveBeenCalledOnce());
    expect(capture.updatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        shortcuts: expect.objectContaining({ 'quickSnip.toggle': expect.objectContaining({ keys: 'Ctrl+Shift+X' }) }),
      }),
    );
    expect(wrapper.findAll('.shortcut-row')[0].find('.shortcut-value').text()).toBe('Ctrl+Shift+X');

    capture.updatePreferences.mockRejectedValueOnce(new Error('preferences unavailable'));
    await wrapper.findAll('.change-shortcut')[0].trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.shortcut-error').exists()).toBe(true));
    expect(wrapper.find('.shortcut-error').text()).toContain('preferences unavailable');

    capture.updatePreferences.mockRejectedValueOnce(new Error(''));
    await wrapper.findAll('.change-shortcut')[0].trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.shortcut-error').text()).toBe('Failed to update shortcut'));
  });
});
