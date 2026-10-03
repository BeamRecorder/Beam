import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { initI18n } from './i18n';
import type { DesktopCaptureApi } from './api/types/capture-api';
import './style.css';

// An isolated development page previews the ten requested example presets.
// It has no capture, preference storage, or editor-preset write operations.
if (import.meta.env.DEV) {
  history.replaceState(null, '', `${location.pathname}?preview=1`);
  const bridge = {
    platform: 'linux',
    onQuickSnipConfigure: () => () => {},
    notifyQuickSnipSettingsReady: () => {},
  } satisfies Pick<DesktopCaptureApi, 'platform' | 'onQuickSnipConfigure' | 'notifyQuickSnipSettingsReady'>;
  Object.defineProperty(window, 'capture', { value: bridge, configurable: true });
  const { default: Settings } = await import('./components/quick-snip/QuickSnipSettings.vue');
  const app = createApp(Settings);
  app.use(createPinia());
  app.use(await initI18n());
  app.mount('#app');
  document.documentElement.classList.add('dark');
  document.body.style.cssText = 'width:266px;height:420px;margin:24px';
} else {
  document.getElementById('app')!.textContent = 'This preview is available in development only.';
}
