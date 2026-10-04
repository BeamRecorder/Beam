import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import TeleprompterWindowApp from './components/hud/teleprompter/TeleprompterWindowApp.vue';
import { prepareWindowAppearance } from './window-bootstrap';

const app = createApp(TeleprompterWindowApp);
const pinia = createPinia();
app.use(pinia);
app.use(await prepareWindowAppearance(pinia));
app.mount('#app');
