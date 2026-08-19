import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  onPreferencesChanged: vi.fn(),
}));

vi.mock('~/api/capture', () => ({ capture }));

import { useSpellCheckStore } from '../spell-check';

type SpellCheckPreferences = { spellCheck?: { enabled?: boolean } };

let preferenceListener: ((preferences: SpellCheckPreferences) => void) | undefined;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  preferenceListener = undefined;
  capture.getPreferences.mockResolvedValue({ spellCheck: { enabled: true } });
  capture.updatePreferences.mockResolvedValue({ spellCheck: { enabled: true } });
  capture.onPreferencesChanged.mockImplementation((listener) => {
    preferenceListener = listener;
    return vi.fn();
  });
});

describe('spell-check store', () => {
  it('loads the persisted value and subscribes to preference changes', async () => {
    capture.getPreferences.mockResolvedValueOnce({ spellCheck: { enabled: false } });
    const store = useSpellCheckStore();

    await vi.waitFor(() => expect(store.enabled).toBe(false));

    expect(capture.getPreferences).toHaveBeenCalledOnce();
    expect(capture.onPreferencesChanged).toHaveBeenCalledOnce();
  });

  it('persists a user toggle and applies the returned preference', async () => {
    const store = useSpellCheckStore();
    await vi.waitFor(() => expect(capture.getPreferences).toHaveBeenCalledOnce());
    capture.updatePreferences.mockResolvedValueOnce({ spellCheck: { enabled: false } });

    await store.setEnabled(false);

    expect(capture.updatePreferences).toHaveBeenCalledWith({ spellCheck: { enabled: false } });
    expect(store.enabled).toBe(false);
  });

  it('syncs an updated preference received from Electron', async () => {
    const store = useSpellCheckStore();
    await vi.waitFor(() => expect(preferenceListener).toBeDefined());

    preferenceListener?.({ spellCheck: { enabled: false } });

    expect(store.enabled).toBe(false);
  });

  it('rolls back the optimistic toggle when persistence fails', async () => {
    const store = useSpellCheckStore();
    await vi.waitFor(() => expect(capture.getPreferences).toHaveBeenCalledOnce());
    capture.updatePreferences.mockRejectedValueOnce(new Error('preference write failed'));

    await store.setEnabled(false);

    expect(store.enabled).toBe(true);
  });
});
