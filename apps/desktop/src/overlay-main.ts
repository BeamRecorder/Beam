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
const camera = new URLSearchParams(window.location.search).has('cameraOverlay');
const [i18n, module] = await Promise.all([
  prepareWindowAppearance(pinia),
  camera
    ? import('./components/hud/camera/CameraOverlayApp.vue')
    : import('./components/quick-snip/QuickSnipCropBar.vue'),
]);
const app = createApp(OverlayWindowApp, { content: module.default });
app.use(pinia);
app.use(i18n);
useLocaleStore(pinia);
app.mount('#app');
completeRecorderStartup();
