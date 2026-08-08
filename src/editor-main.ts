import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { MotionPlugin } from '@vueuse/motion';
import './style.css';
import EditorWindowApp from './components/video-editor/EditorWindowApp.vue';
import { initI18n } from './i18n';
import { useThemeStore } from './stores/theme';
import { capture } from './api/capture';

// The HUD intentionally uses a transparent document root. The editor is an
// opaque native window and must not inherit that transparent fallback.
document.documentElement.classList.add('editor-window-root');

const bootstrap = async () => {
  try {
    const preferences = await capture.getPreferences();
    const dark =
      preferences.theme === 'dark' ||
      (preferences.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch {
    document.documentElement.classList.remove('dark');
  }

  const app = createApp(EditorWindowApp);
  const pinia = createPinia();
  app.use(pinia);
  app.use(MotionPlugin);
  app.use(initI18n());
  useThemeStore(pinia);
  app.mount('#app');
};

void bootstrap();
