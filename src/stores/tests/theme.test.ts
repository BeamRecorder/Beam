import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceSettings } from '../../api/types/capture-api';

const preferences = (theme: PreferenceSettings['theme']): PreferenceSettings => ({
  schemaVersion: 3,
  theme,
  recordingBar: { visibility: 'always' },
  recordingInteractions: { enabled: false, noticeDismissed: false },
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
let mediaChange: ((event: MediaQueryListEvent) => void) | undefined;
let mediaMatches = false;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.documentElement.classList.remove('dark');
  mediaMatches = false;
  Object.defineProperty(window, 'capture', {
    configurable: true,
    value: capture,
  });
  window.matchMedia = vi.fn(
    () =>
      ({
        get matches() {
          return mediaMatches;
        },
        addEventListener: vi.fn((_type, listener) => {
          mediaChange = listener;
        }),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  capture.getPreferences.mockResolvedValue(preferences('light'));
  capture.updatePreferences.mockResolvedValue(preferences('light'));
  capture.onPreferencesChanged.mockReturnValue(vi.fn());
  setActivePinia(createPinia());
});

afterEach(() => {
  delete window.capture;
});

const loadStore = async () => {
  const { useThemeStore } = await import('../theme');
  const store = useThemeStore();
  await Promise.resolve();
  await nextTick();
  return store;
};

describe('theme store', () => {
  it('hydrates the persisted dark theme and applies it to the document root', async () => {
    capture.getPreferences.mockResolvedValue(preferences('dark'));
    const store = await loadStore();
    expect(store.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('persists user choices only after hydration and changes the root class', async () => {
    const store = await loadStore();
    expect(capture.updatePreferences).not.toHaveBeenCalled();
    store.theme = 'dark';
    await nextTick();
    expect(capture.updatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'dark',
        appearance: expect.objectContaining({ theme: 'dark' }),
      }),
    );
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    store.theme = 'light';
    await nextTick();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('uses the operating-system preference only for the system option', async () => {
    mediaMatches = true;
    const store = await loadStore();
    store.theme = 'system';
    await nextTick();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    mediaMatches = false;
    mediaChange?.({ matches: false } as MediaQueryListEvent);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    store.theme = 'light';
    mediaMatches = true;
    mediaChange?.({ matches: true } as MediaQueryListEvent);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('synchronizes a preference change from another Electron renderer', async () => {
    let notify: ((value: PreferenceSettings) => void) | undefined;
    capture.onPreferencesChanged.mockImplementation((callback: (value: PreferenceSettings) => void) => {
      notify = callback;
      return vi.fn();
    });
    const store = await loadStore();
    notify?.(preferences('dark'));
    await nextTick();
    expect(store.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(capture.updatePreferences).not.toHaveBeenCalled();
  });

  it('marks hydration complete when loading preferences fails, without adding a false dark mode', async () => {
    capture.getPreferences.mockRejectedValue(new Error('preload unavailable'));
    const store = await loadStore();
    expect(store.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

});
