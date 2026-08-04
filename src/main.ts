import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { MotionPlugin } from '@vueuse/motion';
import './style.css';
import App from './App.vue';
import { useThemeStore } from './stores/theme';
import { initI18n } from './i18n';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(MotionPlugin);

const i18n = initI18n();
app.use(i18n);

// The store must exist before the HUD is rendered: preferences are otherwise
// initialized only after opening the preferences panel.
useThemeStore(pinia);
app.mount('#app');
