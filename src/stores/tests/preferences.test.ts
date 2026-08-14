import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceSettings } from '../../api/types/capture-api';

const settings = (theme: PreferenceSettings['theme'] = 'light'): PreferenceSettings => ({
  schemaVersion: 2,
  theme,
  recordingBar: { visibility: 'always' },
  alwaysOnTop: true,
  devices: {},
  shortcuts: {},
  backgroundPresets: { colors: [], gradients: [] },
  extras: {},
});

const capture = {
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  onPreferencesChanged: vi.fn(),
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  setActivePinia(createPinia());
  Object.defineProperty(window, 'capture', {
    configurable: true,
    value: capture,
  });
  capture.getPreferences.mockResolvedValue(settings());
  capture.updatePreferences.mockResolvedValue(settings('dark'));
  capture.onPreferencesChanged.mockReturnValue(vi.fn());
});

afterEach(() => {
  delete window.capture;
});

describe('preferences store', () => {
  it('loads preferences and subscribes exactly once across repeated loads', async () => {
    const { usePreferencesStore } = await import('../preferences');
    const store = usePreferencesStore();
    await expect(store.load()).resolves.toEqual(settings());
    await store.load();
    expect(store.settings).toEqual(settings());
    expect(capture.onPreferencesChanged).toHaveBeenCalledOnce();
  });

  it('updates local state when the Electron preference event arrives', async () => {
    let listener: ((next: PreferenceSettings) => void) | undefined;
    capture.onPreferencesChanged.mockImplementation((next: (value: PreferenceSettings) => void) => {
      listener = next;
      return vi.fn();
    });
    const { usePreferencesStore } = await import('../preferences');
    const store = usePreferencesStore();
    await store.load();
    listener?.(settings('system'));
    expect(store.settings).toEqual(settings('system'));
  });

  it('serializes patches before persistence, drops undefined fields, and retains returned settings', async () => {
    const { usePreferencesStore } = await import('../preferences');
    const store = usePreferencesStore();
    const patch = {
      theme: 'dark' as const,
      extras: { retained: true, omitted: undefined },
    };
    await expect(store.update(patch)).resolves.toEqual(settings('dark'));
    expect(capture.updatePreferences).toHaveBeenCalledWith({
      theme: 'dark',
      extras: { retained: true },
    });
    expect(store.settings).toEqual(settings('dark'));
  });

  it('keeps the current state when persistence fails', async () => {
    capture.updatePreferences.mockRejectedValueOnce(new Error('disk full'));
    const { usePreferencesStore } = await import('../preferences');
    const store = usePreferencesStore();
    await store.load();
    await expect(store.update({ theme: 'dark' })).rejects.toThrow('disk full');
    expect(store.settings).toEqual(settings());
  });
});
