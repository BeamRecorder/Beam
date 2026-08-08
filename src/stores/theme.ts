import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { capture } from '../api/capture';

export const useThemeStore = defineStore('theme', () => {
  const logTheme = (message: string, details?: unknown) => {
    if (details === undefined) console.info(`[Beam theme] ${message}`);
    else console.info(`[Beam theme] ${message}`, details);
  };
  // A deterministic light default prevents the HUD from following an OS dark
  // scheme before the user has explicitly chosen a preference.
  const theme = ref<'light' | 'dark' | 'system'>('light');
  const hydrated = ref(false);
  let synchronizingPreference = false;

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const applyTheme = () => {
    const root = document.documentElement;
    const isDark = theme.value === 'dark' || (theme.value === 'system' && mediaQuery.matches);
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    logTheme('renderer theme applied', { selected: theme.value, dark: isDark });
  };

  void capture
    .getPreferences()
    .then((preferences) => {
      synchronizingPreference = true;
      theme.value = preferences.theme;
      synchronizingPreference = false;
      hydrated.value = true;
      applyTheme();
      logTheme('preferences hydrated', { theme: preferences.theme });
    })
    .catch(() => {
      hydrated.value = true;
      applyTheme();
      logTheme('preferences hydration failed; keeping light fallback');
    });

  // Watch for changes in select choice
  watch(
    theme,
    () => {
      if (!hydrated.value) return;
      if (!synchronizingPreference) void capture.updatePreferences({ theme: theme.value }).catch(() => undefined);
      applyTheme();
    },
    { immediate: true, flush: 'sync' },
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
    logTheme('preference broadcast received', { theme: preferences.theme });
    if (preferences.theme === theme.value) return;
    synchronizingPreference = true;
    theme.value = preferences.theme;
    synchronizingPreference = false;
  });

  return {
    theme,
    applyTheme,
  };
});
