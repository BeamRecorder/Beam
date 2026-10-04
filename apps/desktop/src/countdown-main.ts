import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import CountdownOverlay from './components/hud/recorder/CountdownOverlay.vue';
import { prepareWindowAppearance } from './window-bootstrap';

const app = createApp(CountdownOverlay);
const pinia = createPinia();
app.use(pinia);
app.use(await prepareWindowAppearance(pinia));
app.mount('#app');
