import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import CountdownOverlay from './components/hud/recorder/CountdownOverlay.vue';
import { initI18n } from './i18n';
import { useThemeStore } from './stores/theme';

const app = createApp(CountdownOverlay);
const pinia = createPinia();
app.use(pinia);
app.use(initI18n());
useThemeStore(pinia);
app.mount('#app');
