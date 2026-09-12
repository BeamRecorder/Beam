import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import CountdownOverlay from './components/hud/recorder/CountdownOverlay.vue';
import { useThemeStore } from './stores/theme';

const app = createApp(CountdownOverlay);
const pinia = createPinia();
app.use(pinia);
useThemeStore(pinia);
app.mount('#app');
