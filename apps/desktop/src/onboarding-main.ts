import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { MotionPlugin } from '@vueuse/motion';
import './style.css';
import OnboardingApp from './OnboardingApp.vue';
import { prepareWindowAppearance } from './window-bootstrap';
import { useLocaleStore } from './stores/locale';

document.documentElement.classList.add('onboarding-window-root');

const bootstrap = async () => {
  const pinia = createPinia();
  const i18n = await prepareWindowAppearance(pinia);

  const app = createApp(OnboardingApp);
  app.use(pinia);
  app.use(MotionPlugin);
  app.use(i18n);
  useLocaleStore(pinia);
  app.mount('#app');
};

void bootstrap();
