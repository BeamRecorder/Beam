import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import QuickSnipStatus from './components/quick-snip/QuickSnipStatus.vue';
import { useThemeStore } from './stores/theme';
import { useLocaleStore } from './stores/locale';
import { initI18n } from './i18n';

const app = createApp(QuickSnipStatus);
const pinia = createPinia();
app.use(pinia);
app.use(initI18n());
useThemeStore(pinia);
useLocaleStore(pinia);
app.mount('#app');
