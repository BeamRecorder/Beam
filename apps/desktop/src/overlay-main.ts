import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import OverlayWindowApp from './components/desktop/OverlayWindowApp.vue';
import { useLocaleStore } from './stores/locale';
import { prepareWindowAppearance } from './window-bootstrap';
import { completeRecorderStartup } from './recorder-startup';
import { installBrowserZoomGuard } from './utils/browserZoomGuard';

installBrowserZoomGuard();
const pinia = createPinia();
const settings = new URLSearchParams(window.location.search).has('quickSnipSettings');
const camera = new URLSearchParams(window.location.search).has('cameraOverlay');
// Keep imports in separate statements: production CSS preloading must follow
// the selected overlay rather than the final arm of a conditional expression.
async function loadOverlay() {
  if (settings) return await import('./components/quick-snip/QuickSnipSettings.vue');
  if (camera) return await import('./components/hud/camera/CameraOverlayApp.vue');
  return await import('./components/quick-snip/QuickSnipCropBar.vue');
}
const [i18n, module] = await Promise.all([prepareWindowAppearance(pinia), loadOverlay()]);
const app = createApp(OverlayWindowApp, { content: module.default });
app.use(pinia);
app.use(i18n);
useLocaleStore(pinia);
app.mount('#app');
completeRecorderStartup();
