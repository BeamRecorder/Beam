import { defineStore } from 'pinia';
import { ref } from 'vue';
import { capture } from '~/api/capture';
import type { PreferenceSettings } from '~/api/types/capture-api';

export const useSpellCheckStore = defineStore('spell-check', () => {
  const enabled = ref(true);

  const applyPreferences = (preferences: Partial<PreferenceSettings> | null | undefined) => {
    if (typeof preferences?.spellCheck?.enabled === 'boolean') enabled.value = preferences.spellCheck.enabled;
  };

  const setEnabled = async (value: boolean) => {
    enabled.value = value;
    try {
      applyPreferences(await capture.updatePreferences({ spellCheck: { enabled: value } }));
    } catch {
      enabled.value = !value;
    }
  };

  void capture
    .getPreferences()
    .then(applyPreferences)
    .catch(() => undefined);
  capture.onPreferencesChanged?.(applyPreferences);

  return { enabled, setEnabled };
});
