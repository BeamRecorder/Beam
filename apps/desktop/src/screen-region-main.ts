import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import ScreenRegionOverlayApp from './components/hud/region/ScreenRegionOverlayApp.vue';
import { useLocaleStore } from './stores/locale';
import { prepareWindowAppearance } from './window-bootstrap';
import { installBrowserZoomGuard } from './utils/browserZoomGuard';

installBrowserZoomGuard();
const app = createApp(ScreenRegionOverlayApp);
const pinia = createPinia();
app.use(pinia);
app.use(await prepareWindowAppearance(pinia));
useLocaleStore(pinia);
app.mount('#app');
