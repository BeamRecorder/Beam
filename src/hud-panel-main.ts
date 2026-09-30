import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import HudPanelApp from './components/desktop/HudPanelApp.vue';
import { prepareWindowAppearance } from './window-bootstrap';
import { installBrowserZoomGuard } from './utils/browserZoomGuard';
import { loadHudPanelContent, readHudPanel } from './components/desktop/hud-panel-content';

installBrowserZoomGuard();
const pinia = createPinia();
const panel = readHudPanel(window.location.search);
// Start the selected view, locale and preferences together; mount once all are ready.
const [i18n, content] = await Promise.all([prepareWindowAppearance(pinia), loadHudPanelContent(panel)]);
const app = createApp(HudPanelApp, { panel, content });
app.use(pinia);
app.use(i18n);
document.documentElement.classList.add('editor-window-root');
app.mount('#app');
