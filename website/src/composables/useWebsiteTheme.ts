import { computed, readonly, ref } from 'vue';

export type WebsiteTheme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'beam-website-theme';
const preference = ref<WebsiteTheme>('system');
const systemDark = ref(false);
let initialized = false;
let mediaQuery: MediaQueryList | null = null;

const isWebsiteTheme = (value: string | null): value is WebsiteTheme =>
  value === 'system' || value === 'light' || value === 'dark';

const applyPreference = () => {
  const resolved = preference.value === 'system' ? (systemDark.value ? 'dark' : 'light') : preference.value;
  document.documentElement.dataset.theme = preference.value;
  document.documentElement.style.colorScheme = resolved;
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#111110' : '#f7f5f0');
};

const handleSystemTheme = (event: MediaQueryListEvent | MediaQueryList) => {
  systemDark.value = event.matches;
  if (preference.value === 'system') applyPreference();
};

export const initializeWebsiteTheme = () => {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  preference.value = isWebsiteTheme(saved) ? saved : 'system';
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  systemDark.value = mediaQuery.matches;
  mediaQuery.addEventListener('change', handleSystemTheme);
  applyPreference();
};

export const setWebsiteTheme = (value: WebsiteTheme) => {
  preference.value = value;
  window.localStorage.setItem(STORAGE_KEY, value);
  applyPreference();
};

export function useWebsiteTheme() {
  initializeWebsiteTheme();
  return {
    preference: readonly(preference),
    resolvedTheme: computed(() =>
      preference.value === 'system' ? (systemDark.value ? 'dark' : 'light') : preference.value,
    ),
    setTheme: setWebsiteTheme,
  };
}
