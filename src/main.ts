import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import App from './App.vue';
import { useThemeStore } from './stores/theme';
import { initI18n } from './i18n';
import { completeRecorderStartup } from './recorder-startup';
import { installBrowserZoomGuard } from './utils/browserZoomGuard';

installBrowserZoomGuard();

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

const i18n = await initI18n();
app.use(i18n);

// The store must exist before the HUD is rendered: preferences are otherwise
// initialized only after opening the preferences panel.
useThemeStore(pinia);
app.mount('#app');

completeRecorderStartup();
