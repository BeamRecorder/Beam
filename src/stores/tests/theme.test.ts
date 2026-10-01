import { readFileSync } from 'node:fs';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceSettings } from '../../api/types/capture-api';
import { DEFAULT_APPEARANCE } from '../../types/appearance';

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
let stylesheet: HTMLStyleElement;
const palette = readFileSync('src/theme/surfaces.css', 'utf8');
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

beforeEach(() => {
  stylesheet = document.createElement('style');
  stylesheet.textContent = palette;
  document.head.append(stylesheet);
  vi.resetModules();
  vi.clearAllMocks();
  document.documentElement.removeAttribute('style');
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
  stylesheet.remove();
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
  it('resolves the default light palette without rewriting the saved color', async () => {
    const store = await loadStore();
    expect(token('--color-primary')).toBe('#cf4a1d');
    expect(token('--color-primary-light').replaceAll(' ', '')).toBe('rgba(207,74,29,0.07)');
    expect(store.primaryColor).toBe(DEFAULT_APPEARANCE.primaryColor);
    expect(token('--text-on-primary')).toBe('#ffffff');
    expect(capture.updatePreferences).not.toHaveBeenCalled();
  });

  it('updates the accent when the system theme changes', async () => {
    capture.getPreferences.mockResolvedValue(preferences('system'));
    await loadStore();
    expect(token('--color-primary')).toBe('#cf4a1d');
    mediaChange?.({ matches: true } as MediaQueryListEvent);
    expect(token('--color-primary')).toBe('#cf4a1d');
    expect(token('--text-on-primary')).toBe('#ffffff');
    mediaChange?.({ matches: false } as MediaQueryListEvent);
    expect(token('--color-primary')).toBe('#cf4a1d');
    expect(capture.updatePreferences).not.toHaveBeenCalled();
  });

  it.each(['light', 'dark', 'system'] as const)(
    'keeps saved Beam orange actions white without an active preset in %s',
    async (theme) => {
      capture.getPreferences.mockResolvedValue({
        ...preferences(theme),
        appearance: { ...DEFAULT_APPEARANCE, theme, primaryColor: '#ff5a1f', activePresetId: null, radiusPx: 10 },
      });
      const store = await loadStore();
      expect(token('--color-primary')).toBe('#cf4a1d');
      expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('');
      expect(token('--text-on-primary')).toBe('#ffffff');
      expect(token('--text-on-primary-hover')).toBe('#ffffff');
      expect(store.primaryColor).toBe('#ff5a1f');
      expect(store.activePresetId).toBeNull();
      expect(capture.updatePreferences).not.toHaveBeenCalled();
    },
  );

  it('keeps custom colors across light and dark theme changes', async () => {
    capture.getPreferences.mockResolvedValue({
      ...preferences('light'),
      appearance: { ...DEFAULT_APPEARANCE, primaryColor: '#123456', activePresetId: null },
    });
    const store = await loadStore();
    expect(token('--color-primary')).toBe('#123456');
    store.theme = 'dark';
    await nextTick();
    expect(token('--color-primary')).toBe('#123456');
    store.theme = 'light';
    await nextTick();
    expect(token('--color-primary')).toBe('#123456');
  });
  it('clears custom accent overrides when returning to the shared Beam palette', async () => {
    const store = await loadStore();
    store.setPrimaryColor('#123456');
    await nextTick();
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#123456');
    store.resetToDefault();
    await nextTick();
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--text-on-primary')).toBe('');
    expect(token('--color-primary')).toBe('#cf4a1d');
    expect(token('--text-on-primary')).toBe('#ffffff');
  });

  it('inherits default surfaces from CSS after restoring a custom surface tone', async () => {
    const store = await loadStore();
    store.setSurfaceTone('slate');
    await nextTick();
    expect(document.documentElement.style.getPropertyValue('--color-bg-surface')).toBe('#f1f5f9');
    store.setSurfaceTone('default');
    await nextTick();
    expect(document.documentElement.style.getPropertyValue('--color-bg-surface')).toBe('');
    expect(token('--color-bg-surface')).toBe('#f7f7f8');
    store.theme = 'dark';
    await nextTick();
    expect(token('--color-bg-surface')).toBe('#212123');
  });

  it('hydrates the persisted dark theme and applies it to the document root', async () => {
    capture.getPreferences.mockResolvedValue(preferences('dark'));
    const store = await loadStore();
    expect(store.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('shares the single bootstrap preference snapshot with the preferences store', async () => {
    const initial = {
      ...preferences('dark'),
      extras: { screenshotCompositionPosition: { x: 0.35, y: 0.8 } },
    };
    capture.getPreferences.mockResolvedValue(initial);

    await loadStore();

    const { usePreferencesStore } = await import('../preferences');
    expect(usePreferencesStore().settings).toEqual(initial);
    expect(capture.getPreferences).toHaveBeenCalledOnce();
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
    const { usePreferencesStore } = await import('../preferences');
    expect(usePreferencesStore().settings).toEqual(preferences('dark'));
    expect(capture.updatePreferences).not.toHaveBeenCalled();
  });

  it('syncs extras-only changes before skipping unchanged appearance hydration', async () => {
    let notify: ((value: PreferenceSettings) => void) | undefined;
    capture.onPreferencesChanged.mockImplementation((callback: (value: PreferenceSettings) => void) => {
      notify = callback;
      return vi.fn();
    });
    const initial = {
      ...preferences('light'),
      appearance: DEFAULT_APPEARANCE,
      extras: { screenshotCompositionPosition: { x: 0.25, y: 0.4 } },
    };
    capture.getPreferences.mockResolvedValue(initial);

    const themeStore = await loadStore();
    const updated = {
      ...initial,
      extras: { screenshotCompositionPosition: { x: 0.75, y: 0.9 } },
    };
    notify?.(updated);
    await nextTick();

    const { usePreferencesStore } = await import('../preferences');
    expect(usePreferencesStore().settings).toEqual(updated);
    expect(themeStore.theme).toBe('light');
    expect(capture.getPreferences).toHaveBeenCalledOnce();
    expect(capture.updatePreferences).not.toHaveBeenCalled();
  });

  it('marks hydration complete when loading preferences fails, without adding a false dark mode', async () => {
    capture.getPreferences.mockRejectedValue(new Error('preload unavailable'));
    const store = await loadStore();
    expect(store.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
