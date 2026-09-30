import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import HudPanelApp from './components/desktop/HudPanelApp.vue';
import { useThemeStore } from './stores/theme';
import { initI18n } from './i18n';
import { installBrowserZoomGuard } from './utils/browserZoomGuard';

installBrowserZoomGuard();
const app = createApp(HudPanelApp);
const pinia = createPinia();
app.use(pinia);
app.use(initI18n());
await useThemeStore(pinia).ready;
document.documentElement.classList.add('editor-window-root');
app.mount('#app');
