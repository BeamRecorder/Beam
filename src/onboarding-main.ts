import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { MotionPlugin } from '@vueuse/motion';
import './style.css';
import OnboardingApp from './OnboardingApp.vue';
import { initI18n } from './i18n';
import { useThemeStore } from './stores/theme';
import { useLocaleStore } from './stores/locale';
import { capture } from './api/capture';

document.documentElement.classList.add('onboarding-window-root');

const bootstrap = async () => {
  const pinia = createPinia();
  const i18n = initI18n();

  try {
    const preferences = await capture.getPreferences();
    const dark =
      preferences.theme === 'dark' ||
      (preferences.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch {
    document.documentElement.classList.remove('dark');
  }

  const app = createApp(OnboardingApp);
  app.use(pinia);
  app.use(MotionPlugin);
  app.use(i18n);
  useThemeStore(pinia);
  useLocaleStore(pinia);
  app.mount('#app');
};

void bootstrap();
