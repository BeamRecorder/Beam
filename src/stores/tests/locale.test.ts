import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentLocale, setCurrentLocale } from '../../i18n';
import { useLocaleStore } from '../locale';

const captureMock = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  onPreferencesChanged: vi.fn(),
}));

vi.mock('../../api/capture', () => ({ capture: captureMock }));

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  localStorage.clear();
  setCurrentLocale('en');
  captureMock.getPreferences.mockResolvedValue({ extras: {} });
  captureMock.updatePreferences.mockResolvedValue({});
  captureMock.onPreferencesChanged.mockReturnValue(vi.fn());
});

afterEach(() => {
  localStorage.clear();
  setCurrentLocale('en');
});

describe('locale store', () => {
  it('updates locale, syncs i18n, and persists to capture preferences', async () => {
    const store = useLocaleStore();
    expect(store.locale).toBe('en');

    store.setLocale('fr');
    expect(store.locale).toBe('fr');
    expect(getCurrentLocale()).toBe('fr');
    expect(localStorage.getItem('locale')).toBe('fr');
    expect(captureMock.updatePreferences).toHaveBeenCalledWith({ extras: { locale: 'fr' } });
  });

  it('syncs when preferences change event is broadcasted from another window', async () => {
    let preferencesListener: ((prefs: any) => void) | undefined;
    captureMock.onPreferencesChanged.mockImplementation((cb: (prefs: any) => void) => {
      preferencesListener = cb;
      return vi.fn();
    });

    const store = useLocaleStore();
    expect(store.locale).toBe('en');

    preferencesListener?.({ extras: { locale: 'es' } });
    expect(store.locale).toBe('es');
    expect(getCurrentLocale()).toBe('es');
  });

  it('syncs when a storage event arrives from another window', async () => {
    const store = useLocaleStore();

    window.dispatchEvent(new StorageEvent('storage', { key: 'locale', newValue: 'de' }));
    expect(store.locale).toBe('de');
    expect(getCurrentLocale()).toBe('de');
  });

  it('syncs on window focus if localStorage was updated externally', async () => {
    const store = useLocaleStore();

    localStorage.setItem('locale', 'ja');
    window.dispatchEvent(new Event('focus'));
    expect(store.locale).toBe('ja');
    expect(getCurrentLocale()).toBe('ja');
  });
});
