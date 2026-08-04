import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import TeleprompterWindowApp from './components/hud/teleprompter/TeleprompterWindowApp.vue';
import { initI18n } from './i18n';
import { useThemeStore } from './stores/theme';

const app = createApp(TeleprompterWindowApp);
const pinia = createPinia();
app.use(pinia);
app.use(initI18n());
useThemeStore(pinia);
app.mount('#app');
