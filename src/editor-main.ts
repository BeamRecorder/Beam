import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { MotionPlugin } from '@vueuse/motion';
import './style.css';
import EditorWindowApp from './components/video-editor/EditorWindowApp.vue';
import { initI18n } from './i18n';
import { useThemeStore } from './stores/theme';

const bootstrap = async () => {
  const app = createApp(EditorWindowApp);
  const pinia = createPinia();
  app.use(pinia);
  app.use(MotionPlugin);
  app.use(initI18n());
  await useThemeStore(pinia).ready;
  // Keep the native window's themed backing visible until all appearance
  // tokens are hydrated, then make the editor document opaque before mounting.
  document.documentElement.classList.add('editor-window-root');
  app.mount('#app');
};

void bootstrap();
