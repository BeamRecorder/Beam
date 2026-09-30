import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import App from './App.vue';
import { prepareWindowAppearance } from './window-bootstrap';
import { completeRecorderStartup } from './recorder-startup';
import { installBrowserZoomGuard } from './utils/browserZoomGuard';

installBrowserZoomGuard();

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

const i18n = await prepareWindowAppearance(pinia);
app.use(i18n);

app.mount('#app');

completeRecorderStartup();
