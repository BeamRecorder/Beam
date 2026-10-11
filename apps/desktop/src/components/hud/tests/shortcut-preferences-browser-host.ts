import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { i18n, initI18n, setCurrentLocale } from '~/i18n';
import { isSupportedLocale } from '~/i18n/locales';
import type { PreferencePatch } from '~/api/types/capture-api';
import type { ActionBindings } from '~/shortcuts/action-types';
import '~/style.css';

let shortcuts: ActionBindings = {};
const preferences = () => ({
  schemaVersion: 3,
  theme: 'dark',
  recordingBar: { visibility: 'always' },
  recordingInteractions: { enabled: false, noticeDismissed: false },
  backgroundPresets: { colors: [], gradients: [] },
  shortcuts,
  devices: {},
  extras: {},
});
Object.defineProperty(window, 'capture', {
  value: {
    platform: 'linux',
    canLaunchAtStartup: false,
    getPreferences: async () => preferences(),
    onPreferencesChanged: () => () => {},
    updatePreferences: async (patch: PreferencePatch) => {
      shortcuts = { ...shortcuts, ...patch.shortcuts };
      document.body.dataset.savedShortcuts = JSON.stringify(shortcuts);
      return preferences();
    },
    setShortcutCaptureActive: async (active: boolean) => {
      document.body.dataset.capturingShortcut = String(active);
    },
    getUpdateState: async () => ({ status: 'unsupported', currentVersion: '0.5.3' }),
    onUpdateState: () => () => {},
    getDirectories: async () => ({
      projects: { directory: null, recent: [] },
      exports: { directory: null, lastDirectory: null, recent: [] },
      defaultProjectsDirectory: '/home/test/Beam',
      defaultExportDirectory: '/home/test/Videos',
    }),
  },
});
const { default: ShortcutPreferences } = await import('../settings/ShortcutPreferences.vue');
await initI18n();
const query = new URLSearchParams(location.search);
const locale = query.get('locale') ?? 'en';
if (!isSupportedLocale(locale)) throw new Error(`Unsupported fixture locale: ${locale}`);
await setCurrentLocale(locale);
document.documentElement.classList.toggle('dark', query.get('theme') !== 'light');
document.body.style.background = 'var(--color-bg-surface)';
const pinia = createPinia();
const { usePreferencesStore } = await import('~/stores/preferences');
await usePreferencesStore(pinia).load();
const { default: HudSettingsWindow } = await import('../settings/HudSettingsWindow.vue');
createApp({
  render: () =>
    query.has('window')
      ? h('main', { style: { display: 'flex', height: '100vh' } }, [h(HudSettingsWindow)])
      : h('main', { style: { maxWidth: '720px', padding: '32px', margin: '0 auto' } }, [
          h('h1', { style: { margin: '0 0 24px' } }, i18n.global.t('HudPreferences.shortcuts')),
          h(ShortcutPreferences, { focusedSetting: query.get('action') ?? 'quickSnip.toggle' }),
        ]),
})
  .use(pinia)
  .use(i18n)
  .mount('#app');
