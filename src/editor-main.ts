import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { MotionPlugin } from '@vueuse/motion';
import './style.css';
import EditorWindowApp from './components/video-editor/EditorWindowApp.vue';
import { initI18n } from './i18n';
import { useThemeStore } from './stores/theme';

const app = createApp(EditorWindowApp);
const pinia = createPinia();
app.use(pinia);
app.use(MotionPlugin);
app.use(initI18n());
useThemeStore(pinia);
app.mount('#app');
