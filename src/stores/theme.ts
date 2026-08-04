import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { capture } from '../api/capture';

export const useThemeStore = defineStore('theme', () => {
  // A deterministic light default prevents the HUD from following an OS dark
  // scheme before the user has explicitly chosen a preference.
  const theme = ref<'light' | 'dark' | 'system'>('light');
  const hydrated = ref(false);

  void capture
    .getPreferences()
    .then((preferences) => {
      theme.value = preferences.theme;
      hydrated.value = true;
    })
    .catch(() => {
      hydrated.value = true;
    });

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const applyTheme = () => {
    const root = document.documentElement;
    const isDark = theme.value === 'dark' || (theme.value === 'system' && mediaQuery.matches);
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  };

  // Watch for changes in select choice
  watch(
    theme,
    () => {
      if (!hydrated.value) return;
      void capture.updatePreferences({ theme: theme.value }).catch(() => undefined);
      applyTheme();
    },
    { immediate: true },
  );

  // Listen to OS scheme changes
  mediaQuery.addEventListener('change', () => {
    if (theme.value === 'system') {
      applyTheme();
    }
  });

  // The camera overlay is a separate Electron renderer. Sync a preference
  // changed in the main window immediately instead of waiting for reload.
  capture.onPreferencesChanged((preferences) => {
    if (preferences.theme !== theme.value) theme.value = preferences.theme;
  });

  return {
    theme,
    applyTheme,
  };
});
