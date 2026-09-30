import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import SourcePickerApp from './components/hud/source-picker/SourcePickerApp.vue';
import { initI18n } from './i18n';
import { installBrowserZoomGuard } from './utils/browserZoomGuard';

const browserPreview = import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === '1';
if (window.capture || browserPreview) {
  installBrowserZoomGuard();
  const initialSources = browserPreview
    ? (await import('./components/hud/source-picker/development-sources')).developmentSources
    : undefined;
  const app = createApp(SourcePickerApp, { initialSources });
  const pinia = createPinia();
  app.use(pinia);
  if (window.capture) {
    const { prepareWindowAppearance } = await import('./window-bootstrap');
    app.use(await prepareWindowAppearance(pinia));
  } else {
    app.use(await initI18n());
    document.documentElement.classList.add('dark');
  }
  app.mount('#app');
} else {
  document.getElementById('app')!.textContent = 'Source selection requires the Electron capture bridge.';
}
