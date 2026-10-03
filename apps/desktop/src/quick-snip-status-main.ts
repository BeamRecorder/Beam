import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import QuickSnipStatus from './components/quick-snip/QuickSnipStatus.vue';
import { useLocaleStore } from './stores/locale';
import { prepareWindowAppearance } from './window-bootstrap';

const app = createApp(QuickSnipStatus);
const pinia = createPinia();
app.use(pinia);
app.use(await prepareWindowAppearance(pinia));
useLocaleStore(pinia);
app.mount('#app');
