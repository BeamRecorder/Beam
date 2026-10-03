import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import OnboardingWindow from './components/onboarding/OnboardingWindow.vue';
import { prepareWindowAppearance } from './window-bootstrap';
import { useLocaleStore } from './stores/locale';

document.documentElement.classList.add('onboarding-window-root');

const bootstrap = async () => {
  const pinia = createPinia();
  const i18n = await prepareWindowAppearance(pinia);

  const app = createApp(OnboardingWindow);
  app.use(pinia);
  app.use(i18n);
  useLocaleStore(pinia);
  app.mount('#app');
};

void bootstrap();
